import {
  CustomerCreditApplyRequest,
  CustomerCreditHistoryFilters,
  CustomerCreditDiagnostics,
  CustomerCreditDiagnosticsException,
  CustomerCreditOperationResult,
  CustomerCreditRecord,
  CustomerCreditRefundRequest,
  CustomerCreditSummary,
  PaymentRecord
} from '../../types';
import {
  allocateCreditFIFO,
  assertApplicationTarget,
  assertBalanceAfter,
  assertPositiveMoney,
  assertRefundRequest
} from '../../domain/customerCreditRules';
import { calculateOrderAmounts } from '../../domain/orderRules';
import { assertStoredPaymentAggregates, parsePaymentLedger } from '../../domain/paymentRules';
import { round2 } from '../../domain/inventoryRules';
import { createSafeId } from '../../domain/idGenerator';
import { CustomerCreditRepository } from '../repositories/customerCreditRepository';
import { CashRepository } from '../repositories/cashRepository';
import { InvoiceRepository } from '../repositories/invoiceRepository';
import { OrderWriteRepository } from '../repositories/orderWriteRepository';

export class CustomerCreditService {
  constructor(
    private readonly customerCreditRepository: CustomerCreditRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly orderWriteRepository: OrderWriteRepository,
    private readonly cashRepository: CashRepository,
    private readonly db: {
      exec(sql: string): void;
      prepare(sql: string): { get(...params: any[]): unknown; all(...params: any[]): unknown[] };
    }
  ) {}

  /** Called only inside PaymentService's existing transaction. */
  createCreditFromOverpayment(input: {
    customerId?: string;
    orderId: string;
    invoiceId: string;
    paymentId: string;
    amount: number;
    paymentMethod: string;
    invoiceNumber?: string;
    createdAt?: string;
  }): CustomerCreditRecord | undefined {
    if (!input.customerId) throw new Error('لا يمكن إنشاء customer credit دون ربط العميل');
    assertPositiveMoney(input.amount, 'overpaymentAmount');
    if (!input.paymentId) throw new Error('مرجع الدفعة مطلوب لإنشاء customer credit');
    const existing = this.customerCreditRepository.findByIdempotencyKey(input.paymentId)
      .find((entry) => entry.entryType === 'created');
    if (existing) return existing;

    const createdAt = input.createdAt || new Date().toISOString();
    const balanceBefore = this.customerCreditRepository.getBalance(input.customerId);
    const balanceAfter = round2(balanceBefore + input.amount);
    const record: CustomerCreditRecord = {
      id: `CREDIT-${input.paymentId}`,
      customerId: input.customerId,
      orderId: input.orderId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      entryType: 'created',
      amount: round2(input.amount),
      referenceId: input.paymentId,
      notes: input.invoiceNumber ? `زيادة دفعة للفاتورة ${input.invoiceNumber}` : 'زيادة دفعة عميل',
      createdAt,
      operationId: `CREDIT-CREATE-${input.paymentId}`,
      idempotencyKey: input.paymentId,
      method: input.paymentMethod as any,
      reason: 'Overpayment',
      occurredAt: createdAt,
      balanceAfter
    };
    assertBalanceAfter(balanceBefore, 'created', record.amount, balanceAfter);
    this.customerCreditRepository.insert(record);
    return record;
  }

  applyCredit(request: CustomerCreditApplyRequest): CustomerCreditOperationResult {
    return this.withImmediateTransaction(() => {
      const existing = this.customerCreditRepository.findByIdempotencyKey(request.idempotencyKey);
      if (existing.length > 0) return this.resolveIdempotentResult(existing, request);

      const invoice = this.invoiceRepository.findById(request.targetInvoiceId) as any;
      if (!invoice) throw new Error('الفاتورة المستهدفة غير موجودة');
      const order = this.db.prepare('SELECT status, customer_id FROM orders WHERE id = ?').get(invoice.order_id) as any;
      if (!order?.customer_id) throw new Error('الفاتورة المستهدفة غير مرتبطة بعميل');

      const history = this.customerCreditRepository.getHistory(request.customerId);
      const sourceInvoice = history.some((entry) => entry.entryType === 'created' && entry.invoiceId === request.targetInvoiceId)
        ? request.targetInvoiceId
        : undefined;
      const availableBalance = this.customerCreditRepository.getBalance(request.customerId);
      const targetStatus = order.status === 'cancelled' ? 'cancelled' : invoice.payment_status;
      assertApplicationTarget({
        customerId: request.customerId,
        targetInvoiceId: request.targetInvoiceId,
        targetOrderId: invoice.order_id,
        targetInvoiceCustomerId: order.customer_id,
        targetInvoiceStatus: targetStatus,
        targetRemainingAmount: Number(invoice.remaining_amount),
        sourceInvoiceId: sourceInvoice,
        amount: request.amount,
        availableBalance,
        idempotencyKey: request.idempotencyKey
      });
      if (!request.reason.trim()) throw new Error('سبب تطبيق customer credit مطلوب');
      if (!request.actorId) throw new Error('منفذ العملية مطلوب');

      const allocations = allocateCreditFIFO(
        this.customerCreditRepository.getEntriesForFIFO(request.customerId),
        request.amount
      );
      const operationId = createSafeId('CREDIT-APPLY');
      const now = new Date().toISOString();
      let balanceAfter = availableBalance;
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        balanceAfter = round2(balanceAfter - allocation.amount);
        assertBalanceAfter(balanceAfter + allocation.amount, 'applied', allocation.amount, balanceAfter);
        this.customerCreditRepository.insert({
          id: `${operationId}-${index + 1}`,
          customerId: request.customerId,
          entryType: 'applied',
          amount: allocation.amount,
          createdAt: now,
          operationId,
          idempotencyKey: request.idempotencyKey,
          sourceEntryId: allocation.sourceEntryId,
          targetInvoiceId: invoice.id,
          targetOrderId: invoice.order_id,
          invoiceId: invoice.id,
          orderId: invoice.order_id,
          method: 'customer_credit',
          actorId: request.actorId,
          reason: request.reason.trim(),
          occurredAt: now,
          balanceAfter
        });
      }

      const currentPayments = parsePaymentLedger(invoice.payments_json);
      const currentAggregates = assertStoredPaymentAggregates(
        invoice.total_amount,
        invoice.paid_amount,
        invoice.remaining_amount,
        currentPayments,
        invoice.cancellation_writeoff_amount
      );
      const payment: PaymentRecord = {
        id: `${operationId}-PAYMENT`,
        invoiceId: invoice.id,
        orderId: invoice.order_id,
        amount: round2(request.amount),
        cashReceived: 0,
        overpaymentAmount: 0,
        paymentDate: now.slice(0, 10),
        method: 'customer_credit',
        note: request.reason.trim()
      };
      currentPayments.push(payment);
      const applied = round2(currentAggregates.paidAmount + request.amount);
      const amounts = calculateOrderAmounts(Number(invoice.total_amount), applied);
      const writeoff = round2(Number(invoice.cancellation_writeoff_amount || 0));
      const remaining = round2(Math.max(0, amounts.remainingAmount - writeoff));
      this.invoiceRepository.updatePayment(
        invoice.id,
        amounts.paidAmount,
        remaining,
        remaining <= 0.0001 ? 'paid' : 'partial',
        JSON.stringify(currentPayments),
        round2(Number(invoice.cash_received || 0)),
        round2(Number(invoice.overpayment_amount || 0))
      );
      this.orderWriteRepository.updatePayment(
        invoice.order_id,
        amounts.paidAmount,
        remaining,
        round2(Number(invoice.cash_received || 0)),
        round2(Number(invoice.overpayment_amount || 0)),
        writeoff
      );

      return {
        operationId,
        idempotent: false,
        customerId: request.customerId,
        amount: round2(request.amount),
        entryType: 'applied',
        method: 'customer_credit',
        balanceAfter
      };
    });
  }

  refundCredit(request: CustomerCreditRefundRequest): CustomerCreditOperationResult {
    return this.withImmediateTransaction(() => {
      const existing = this.customerCreditRepository.findByIdempotencyKey(request.idempotencyKey);
      if (existing.length > 0) return this.resolveIdempotentResult(existing, request);
      assertRefundRequest({
        customerId: request.customerId,
        amount: request.amount,
        method: request.method,
        availableBalance: this.customerCreditRepository.getBalance(request.customerId),
        idempotencyKey: request.idempotencyKey,
        actorId: request.actorId ?? 'system',
        reason: request.reason
      });

      const availableBalance = this.customerCreditRepository.getBalance(request.customerId);
      const allocations = allocateCreditFIFO(
        this.customerCreditRepository.getEntriesForFIFO(request.customerId),
        request.amount
      );
      const operationId = createSafeId('CREDIT-REFUND');
      const now = new Date().toISOString();
      let balanceAfter = availableBalance;
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        balanceAfter = round2(balanceAfter - allocation.amount);
        assertBalanceAfter(balanceAfter + allocation.amount, 'refunded', allocation.amount, balanceAfter);
        this.customerCreditRepository.insert({
          id: `${operationId}-${index + 1}`,
          customerId: request.customerId,
          entryType: 'refunded',
          amount: allocation.amount,
          createdAt: now,
          operationId,
          idempotencyKey: request.idempotencyKey,
          sourceEntryId: allocation.sourceEntryId,
          method: request.method,
          actorId: request.actorId,
          reason: request.reason.trim(),
          occurredAt: now,
          balanceAfter
        });
      }

      let cashTransactionId: string | undefined;
      if (request.method === 'cash') {
        cashTransactionId = `${operationId}-CASH`;
        this.cashRepository.insert({
          id: cashTransactionId,
          direction: 'out',
          sourceType: 'customer_refund',
          sourceId: operationId,
          amount: round2(request.amount),
          paymentMethod: 'cash',
          transactionDate: now.slice(0, 10),
          description: `استرداد رصيد عميل ${request.customerId}`,
          notes: request.reason.trim(),
          actorId: request.actorId,
          reason: request.reason.trim(),
          createdAt: now
        });
      }

      return {
        operationId,
        idempotent: false,
        customerId: request.customerId,
        amount: round2(request.amount),
        entryType: 'refunded',
        method: request.method,
        balanceAfter,
        cashTransactionId
      };
    });
  }

  getCustomerCreditSummary(customerId: string): CustomerCreditSummary {
    return this.customerCreditRepository.getSummary(customerId);
  }

  getCustomerCreditHistory(customerId: string, filters: CustomerCreditHistoryFilters = {}): CustomerCreditRecord[] {
    return this.customerCreditRepository.getHistory(customerId, filters);
  }

  getDiagnostics(): CustomerCreditDiagnostics {
    const rows = this.db.prepare(`
      SELECT * FROM customer_credits
      ORDER BY occurred_at ASC, created_at ASC, id ASC
    `).all() as any[];
    const summaries = this.db.prepare(`
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        COALESCE(SUM(CASE WHEN cc.entry_type = 'created' THEN cc.amount ELSE 0 END), 0) AS total_created,
        COALESCE(SUM(CASE WHEN cc.entry_type = 'applied' THEN cc.amount ELSE 0 END), 0) AS total_applied,
        COALESCE(SUM(CASE WHEN cc.entry_type = 'refunded' THEN cc.amount ELSE 0 END), 0) AS total_refunded
      FROM customer_credits cc
      LEFT JOIN customers c ON c.id = cc.customer_id
      GROUP BY cc.customer_id, c.name, c.phone
      ORDER BY c.name ASC, cc.customer_id ASC
    `).all() as any[];
    const money = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    const customers = summaries.map((row) => {
      const totalCreated = money(row.total_created);
      const totalApplied = money(row.total_applied);
      const totalRefunded = money(row.total_refunded);
      return {
        customerId: String(row.customer_id),
        customerName: row.customer_name || undefined,
        customerPhone: row.customer_phone || undefined,
        totalCreated,
        totalApplied,
        totalRefunded,
        availableBalance: Math.max(0, money(totalCreated - totalApplied - totalRefunded))
      };
    });
    const legacyExceptions: CustomerCreditDiagnosticsException[] = rows
      .filter((row) => !row.operation_id || row.balance_after === null || row.balance_after === undefined)
      .map((row) => ({
        code: 'LEGACY_CUSTOMER_CREDIT_METADATA',
        recordId: String(row.id),
        customerId: row.customer_id || undefined,
        entryType: row.entry_type,
        reason: 'Legacy customer credit row has nullable lifecycle metadata; no backfill was performed.',
        severity: 'low' as const
      }));
    const integrityWarnings: CustomerCreditDiagnosticsException[] = [];
    for (const row of rows) {
      if (!Number.isFinite(Number(row.amount)) || Number(row.amount) < 0) integrityWarnings.push({
        code: 'INVALID_CUSTOMER_CREDIT_AMOUNT',
        recordId: String(row.id),
        customerId: row.customer_id || undefined,
        entryType: row.entry_type,
        reason: 'Customer credit amount is negative or non-numeric.',
        severity: 'high'
      });
      if (row.entry_type === 'applied' && !row.source_entry_id) integrityWarnings.push({
        code: 'MISSING_CUSTOMER_CREDIT_SOURCE',
        recordId: String(row.id),
        customerId: row.customer_id || undefined,
        entryType: row.entry_type,
        reason: 'Applied customer credit row has no source_entry_id.',
        severity: 'high'
      });
      if (row.entry_type === 'applied' && !row.target_invoice_id) integrityWarnings.push({
        code: 'MISSING_CUSTOMER_CREDIT_TARGET',
        recordId: String(row.id),
        customerId: row.customer_id || undefined,
        entryType: row.entry_type,
        reason: 'Applied customer credit row has no target_invoice_id.',
        severity: 'high'
      });
    }
    for (const customer of customers) {
      const calculated = money(customer.totalCreated - customer.totalApplied - customer.totalRefunded);
      if (calculated < -0.0001) integrityWarnings.push({
        code: 'NEGATIVE_CUSTOMER_CREDIT_BALANCE',
        recordId: customer.customerId,
        customerId: customer.customerId,
        reason: 'Calculated customer credit balance is negative.',
        severity: 'high'
      });
    }
    const totals = customers.reduce((result, customer) => ({
      created: money(result.created + customer.totalCreated),
      applied: money(result.applied + customer.totalApplied),
      refunded: money(result.refunded + customer.totalRefunded),
      availableBalance: money(result.availableBalance + customer.availableBalance)
    }), { created: 0, applied: 0, refunded: 0, availableBalance: 0 });
    return {
      generatedAt: new Date().toISOString(),
      totals,
      customers,
      legacyExceptions,
      integrityWarnings
    };
  }

  getOperation(operationId: string): CustomerCreditOperationResult | undefined {
    const records = this.customerCreditRepository.getOperationById(operationId);
    return records.length > 0 ? this.resolveResult(records, true) : undefined;
  }

  private withImmediateTransaction<T>(callback: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    }
  }

  private resolveIdempotentResult(
    records: CustomerCreditRecord[],
    request: CustomerCreditApplyRequest | CustomerCreditRefundRequest
  ): CustomerCreditOperationResult {
    const result = this.resolveResult(records, true);
    const expectedMethod = 'targetInvoiceId' in request ? 'customer_credit' : request.method;
    if (result.customerId !== request.customerId
      || result.amount !== round2(request.amount)
      || result.method !== expectedMethod
      || records.some((entry) => entry.reason !== request.reason.trim() || entry.actorId !== request.actorId)) {
      throw new Error('idempotencyKey سبق استخدامه بطلب مختلف');
    }
    if ('targetInvoiceId' in request && records.some((entry) => entry.targetInvoiceId !== request.targetInvoiceId)) {
      throw new Error('idempotencyKey سبق استخدامه بفاتورة مستهدفة مختلفة');
    }
    return result;
  }

  private resolveResult(records: CustomerCreditRecord[], idempotent: boolean): CustomerCreditOperationResult {
    const first = records[0];
    const amount = round2(records.reduce((sum, record) => sum + record.amount, 0));
    return {
      operationId: first.operationId || first.id,
      idempotent,
      customerId: first.customerId,
      amount,
      entryType: first.entryType,
      method: first.method || 'customer_credit',
      balanceAfter: round2(records[records.length - 1].balanceAfter || 0),
      cashTransactionId: first.entryType === 'refunded' && first.method === 'cash'
        ? `${first.operationId}-CASH`
        : undefined
    };
  }

}
