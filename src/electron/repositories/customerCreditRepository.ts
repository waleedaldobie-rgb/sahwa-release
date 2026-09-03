import type Database from 'better-sqlite3';
import { CustomerCreditHistoryFilters, CustomerCreditRecord, CustomerCreditSummary } from '../../types';

export class CustomerCreditRepository {
  constructor(private readonly db: Database.Database) {}

  insert(record: CustomerCreditRecord): void {
    if (record.operationId && record.balanceAfter === undefined) {
      throw new Error('balance_after is required for new customer credit operations');
    }
    this.db.prepare(`
      INSERT INTO customer_credits (
        id, customer_id, order_id, invoice_id, payment_id, entry_type,
        amount, reference_id, notes, created_at, operation_id, idempotency_key,
        source_entry_id, target_invoice_id, target_order_id, method,
        actor_id, reason, occurred_at, balance_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.customerId,
      record.orderId || null,
      record.invoiceId || null,
      record.paymentId || null,
      record.entryType,
      record.amount,
      record.referenceId || null,
      record.notes || null,
      record.createdAt,
      record.operationId || null,
      record.idempotencyKey || null,
      record.sourceEntryId || null,
      record.targetInvoiceId || null,
      record.targetOrderId || null,
      record.method || null,
      record.actorId || null,
      record.reason || null,
      record.occurredAt || record.createdAt,
      record.balanceAfter ?? null
    );
  }

  getBalance(customerId: string): number {
    return this.getSummary(customerId).availableBalance;
  }

  getSummary(customerId: string): CustomerCreditSummary {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'created' THEN amount ELSE 0 END), 0) AS total_created,
        COALESCE(SUM(CASE WHEN entry_type = 'applied' THEN amount ELSE 0 END), 0) AS total_applied,
        COALESCE(SUM(CASE WHEN entry_type = 'refunded' THEN amount ELSE 0 END), 0) AS total_refunded
      FROM customer_credits
      WHERE customer_id = ?
    `).get(customerId) as any;
    const totalCreated = roundMoney(row?.total_created);
    const totalApplied = roundMoney(row?.total_applied);
    const totalRefunded = roundMoney(row?.total_refunded);
    const availableBalance = roundMoney(totalCreated - totalApplied - totalRefunded);
    if (availableBalance < -0.0001) throw new Error('Customer credit balance cannot be negative');
    return {
      customerId,
      totalCreated,
      totalApplied,
      totalRefunded,
      availableBalance: Math.max(0, availableBalance)
    };
  }

  getHistory(customerId: string, filters: CustomerCreditHistoryFilters = {}): CustomerCreditRecord[] {
    const conditions = ['customer_id = ?'];
    const params: unknown[] = [customerId];
    if (filters.entryType) {
      conditions.push('entry_type = ?');
      params.push(filters.entryType);
    }
    const limit = filters.limit && Number.isInteger(filters.limit) && filters.limit > 0
      ? Math.min(filters.limit, 500)
      : 500;
    const rows = this.db.prepare(`
      SELECT * FROM customer_credits
      WHERE ${conditions.join(' AND ')}
      ORDER BY occurred_at ASC, created_at ASC, id ASC
      LIMIT ?
    `).all(...params, limit) as any[];
    return rows.map((row) => this.toRecord(row));
  }

  getEntriesForFIFO(customerId: string): Array<{
    id: string;
    createdAt: string;
    amount: number;
    alreadyDebited: number;
  }> {
    const rows = this.db.prepare(`
      SELECT
        c.id,
        c.created_at,
        c.amount,
        COALESCE((
          SELECT SUM(d.amount)
          FROM customer_credits d
          WHERE d.source_entry_id = c.id
            AND d.entry_type IN ('applied', 'refunded')
        ), 0) AS already_debited
      FROM customer_credits c
      WHERE c.customer_id = ? AND c.entry_type = 'created'
      ORDER BY c.created_at ASC, c.id ASC
    `).all(customerId) as any[];
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      amount: roundMoney(row.amount),
      alreadyDebited: roundMoney(row.already_debited)
    }));
  }

  findByPaymentId(paymentId: string, entryType: CustomerCreditRecord['entryType'] = 'created'): CustomerCreditRecord | undefined {
    const row = this.db.prepare(`
      SELECT * FROM customer_credits
      WHERE payment_id = ? AND entry_type = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `).get(paymentId, entryType) as any;
    return row ? this.toRecord(row) : undefined;
  }

  findByIdempotencyKey(idempotencyKey: string): CustomerCreditRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM customer_credits
      WHERE idempotency_key = ?
      ORDER BY created_at ASC, id ASC
    `).all(idempotencyKey) as any[];
    return rows.map((row) => this.toRecord(row));
  }

  getOperationById(operationId: string): CustomerCreditRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM customer_credits
      WHERE operation_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(operationId) as any[];
    return rows.map((row) => this.toRecord(row));
  }

  listByCustomerId(customerId: string): CustomerCreditRecord[] {
    return this.getHistory(customerId);
  }

  private toRecord(row: any): CustomerCreditRecord {
    return {
      id: row.id,
      customerId: row.customer_id,
      orderId: row.order_id || undefined,
      invoiceId: row.invoice_id || undefined,
      paymentId: row.payment_id || undefined,
      entryType: row.entry_type,
      amount: roundMoney(row.amount),
      referenceId: row.reference_id || undefined,
      notes: row.notes || undefined,
      createdAt: row.created_at,
      operationId: row.operation_id || undefined,
      idempotencyKey: row.idempotency_key || undefined,
      sourceEntryId: row.source_entry_id || undefined,
      targetInvoiceId: row.target_invoice_id || undefined,
      targetOrderId: row.target_order_id || undefined,
      method: row.method || undefined,
      actorId: row.actor_id || undefined,
      reason: row.reason || undefined,
      occurredAt: row.occurred_at || undefined,
      balanceAfter: row.balance_after === null || row.balance_after === undefined ? null : roundMoney(row.balance_after)
    };
  }
}

function roundMoney(value: unknown): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
