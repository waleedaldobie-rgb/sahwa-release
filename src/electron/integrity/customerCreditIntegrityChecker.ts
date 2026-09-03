import Database from 'better-sqlite3';
import { round2 } from '../../domain/inventoryRules';
import { IssueCollector, nearlyEqual } from './types';

type SqlRow = Record<string, unknown>;

export function checkCustomerCreditIntegrity(db: Database.Database, issue: IssueCollector): void {
  const customerIds = new Set((db.prepare('SELECT id FROM customers').all() as Array<{ id: string }>).map((row) => String(row.id)));
  const invoiceIds = new Set((db.prepare('SELECT id FROM invoices').all() as Array<{ id: string }>).map((row) => String(row.id)));
  const orderIds = new Set((db.prepare('SELECT id FROM orders').all() as Array<{ id: string }>).map((row) => String(row.id)));
  const creditsById = new Map<string, SqlRow>();
  const customerCredits = db.prepare(`
    SELECT * FROM customer_credits
    ORDER BY customer_id, COALESCE(occurred_at, created_at), created_at, id
  `).all() as SqlRow[];
  for (const credit of customerCredits) creditsById.set(String(credit.id), credit);

  const invoicesById = new Map<string, SqlRow>();
  for (const invoice of db.prepare(`
    SELECT i.id, i.order_id, o.customer_id, i.payment_status, i.remaining_amount
    FROM invoices i JOIN orders o ON o.id = i.order_id
  `).all() as SqlRow[]) {
    invoicesById.set(String(invoice.id), invoice);
  }

  const refundCashBySource = new Map<string, { total: number; count: number }>();
  for (const row of db.prepare(`
    SELECT source_id, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM cash_transactions
    WHERE source_type IN ('customer_refund', 'customer_credit_refund', 'withdrawal') AND direction = 'out'
    GROUP BY source_id
  `).all() as Array<{ source_id: string; total: number; count: number }>) {
    refundCashBySource.set(String(row.source_id), { total: Number(row.total), count: Number(row.count) });
  }

  const balanceByCustomer = new Map<string, number>();
  const operationSourceKeys = new Set<string>();
  for (const credit of customerCredits) {
    const amount = Number(credit.amount);
    const customerId = String(credit.customer_id || '');
    const entryType = String(credit.entry_type || '');
    const sign = entryType === 'created' ? 1 : -1;
    if (!customerId || !customerIds.has(customerId)) {
      issue({ code: 'ORPHAN_CUSTOMER_CREDIT_CUSTOMER', table: 'customer_credits', recordId: String(credit.id), field: 'customer_id', expected: 'existing customer', actual: customerId, reason: 'Customer credit references a missing customer', severity: 'critical' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      issue({ code: 'NEGATIVE_CUSTOMER_CREDIT', table: 'customer_credits', recordId: String(credit.id), field: 'amount', expected: '> 0', actual: amount, reason: 'Customer credit movement amount must be positive', severity: 'critical' });
      continue;
    }
    if (credit.invoice_id && !invoiceIds.has(String(credit.invoice_id))) {
      issue({ code: 'ORPHAN_CUSTOMER_CREDIT_INVOICE', table: 'customer_credits', recordId: String(credit.id), field: 'invoice_id', expected: credit.invoice_id, actual: null, reason: 'Customer credit references a missing invoice', severity: 'critical' });
    }
    if (credit.order_id && !orderIds.has(String(credit.order_id))) {
      issue({ code: 'ORPHAN_CUSTOMER_CREDIT_ORDER', table: 'customer_credits', recordId: String(credit.id), field: 'order_id', expected: credit.order_id, actual: null, reason: 'Customer credit references a missing order', severity: 'critical' });
    }
    if (credit.source_entry_id) {
      const source = creditsById.get(String(credit.source_entry_id));
      if (!source || source.entry_type !== 'created' || source.customer_id !== customerId) {
        issue({ code: 'ORPHAN_CUSTOMER_CREDIT_SOURCE', table: 'customer_credits', recordId: String(credit.id), field: 'source_entry_id', expected: 'created source for same customer', actual: credit.source_entry_id, reason: 'Customer credit debit references an invalid source entry', severity: 'critical' });
      }
      const sourceKey = `${credit.operation_id || credit.id}:${credit.source_entry_id}`;
      if (operationSourceKeys.has(sourceKey)) {
        issue({ code: 'DUPLICATE_CUSTOMER_CREDIT_OPERATION', table: 'customer_credits', recordId: String(credit.id), field: 'operation_id', expected: 'one debit per operation/source pair', actual: sourceKey, reason: 'Customer credit operation debits the same source entry more than once', severity: 'critical' });
      }
      operationSourceKeys.add(sourceKey);
    }
    if (credit.target_invoice_id) {
      const target = invoicesById.get(String(credit.target_invoice_id));
      if (!target || target.customer_id !== customerId || target.payment_status === 'cancelled') {
        issue({ code: 'INVALID_CUSTOMER_CREDIT_TARGET', table: 'customer_credits', recordId: String(credit.id), field: 'target_invoice_id', expected: 'valid same-customer active invoice', actual: credit.target_invoice_id, reason: 'Customer credit target invoice is invalid', severity: 'critical' });
      }
    }
    const previousBalance = round2(balanceByCustomer.get(customerId) || 0);
    const expectedBalance = round2(previousBalance + sign * amount);
    if (expectedBalance < -0.0001) {
      issue({ code: 'NEGATIVE_CUSTOMER_CREDIT_BALANCE', table: 'customer_credits', recordId: String(credit.id), field: 'balance_after', expected: '>= 0', actual: expectedBalance, reason: 'Customer credit ledger balance became negative', severity: 'critical' });
    }
    if (credit.balance_after !== null && credit.balance_after !== undefined && !nearlyEqual(Number(credit.balance_after), Math.max(0, expectedBalance))) {
      issue({ code: 'CUSTOMER_CREDIT_BALANCE_AFTER_MISMATCH', table: 'customer_credits', recordId: String(credit.id), field: 'balance_after', expected: Math.max(0, expectedBalance), actual: credit.balance_after, reason: 'Customer credit balance_after does not match ledger movement', severity: 'critical' });
    }
    balanceByCustomer.set(customerId, Math.max(0, expectedBalance));
    if (credit.entry_type === 'refunded') {
      const cash = refundCashBySource.get(String(credit.operation_id)) || { total: 0, count: 0 };
      if (credit.method === 'cash' && (Number(cash.count) === 0 || !nearlyEqual(Number(cash.total), amount))) {
        issue({ code: 'CUSTOMER_CREDIT_CASH_MISMATCH', table: 'customer_credits', recordId: String(credit.id), field: 'cash_ledger', expected: amount, actual: cash, reason: 'Cash customer credit refund does not match its cash outflow', severity: 'critical' });
      }
      if (credit.method !== 'cash' && Number(cash.count) > 0) {
        issue({ code: 'UNEXPECTED_CUSTOMER_CREDIT_CASH', table: 'customer_credits', recordId: String(credit.id), field: 'cash_ledger', expected: 0, actual: cash, reason: 'Non-cash customer credit refund has a cash ledger entry', severity: 'critical' });
      }
    }
  }
}
