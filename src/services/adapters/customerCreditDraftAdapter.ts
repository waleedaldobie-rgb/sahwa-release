import {
  AppData,
  CustomerCreditApplyRequest,
  CustomerCreditHistoryFilters,
  CustomerCreditOperationResult,
  CustomerCreditRecord,
  CustomerCreditRefundRequest,
  CustomerCreditSummary,
  CashTransaction,
  PaymentRecord
} from '../../types';
import {
  allocateCreditFIFO,
  assertApplicationTarget,
  assertBalanceAfter,
  assertCustomerCreditAmountWithinBalance,
  assertPositiveMoney,
  assertRefundRequest,
  calculateCustomerCreditBalance
} from '../../domain/customerCreditRules';
import { assertStoredPaymentAggregates } from '../../domain/paymentRules';
import { calculateOrderAmounts } from '../../domain/orderRules';
import { createSafeId } from '../../domain/idGenerator';
import { round2 } from '../shared/inventoryRules';
import { findById, hasIdOrSourceId } from '../shared/idempotencyRules';
import { assertCashTransactionContract } from '../../domain/cashRules';

const nowIso = () => new Date().toISOString();

const entriesForCustomer = (draft: AppData, customerId: string) =>
  (draft.customerCredits || []).filter((entry) => entry.customerId === customerId);

const resolveResult = (records: CustomerCreditRecord[], idempotent: boolean): CustomerCreditOperationResult => {
  const ordered = [...records].sort((left, right) => (left.occurredAt || left.createdAt).localeCompare(right.occurredAt || right.createdAt) || left.id.localeCompare(right.id));
  const first = ordered[0];
  return {
    operationId: first.operationId || first.id,
    idempotent,
    customerId: first.customerId,
    amount: round2(records.reduce((sum, record) => sum + Number(record.amount || 0), 0)),
    entryType: first.entryType,
    method: first.method || 'customer_credit',
    balanceAfter: round2(Number(ordered[ordered.length - 1].balanceAfter || 0)),
    cashTransactionId: first.entryType === 'refunded' && first.method === 'cash'
      ? `${first.operationId}-CASH`
      : undefined
  };
};

const resolveIdempotent = (
  records: CustomerCreditRecord[],
  request: CustomerCreditApplyRequest | CustomerCreditRefundRequest
): CustomerCreditOperationResult => {
  const result = resolveResult(records, true);
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
};

const appendCredit = (draft: AppData, entry: CustomerCreditRecord): void => {
  if (findById(draft.customerCredits || [], entry.id)) return;
  draft.customerCredits = [entry, ...(draft.customerCredits || [])];
};

const getFifoEntries = (draft: AppData, customerId: string) => {
  const entries = entriesForCustomer(draft, customerId);
  return entries
    .filter((entry) => entry.entryType === 'created')
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      amount: Number(entry.amount),
      alreadyDebited: round2(entries
        .filter((debit) => (debit.entryType === 'applied' || debit.entryType === 'refunded') && debit.sourceEntryId === entry.id)
        .reduce((sum, debit) => sum + Number(debit.amount || 0), 0))
    }));
};

export function createCustomerCreditFromOverpaymentInDraft(
  draft: AppData,
  input: { customerId?: string; orderId: string; invoiceId: string; paymentId: string; amount: number; paymentMethod: string; invoiceNumber?: string; createdAt?: string }
): CustomerCreditRecord | undefined {
  if (!input.customerId) throw new Error('لا يمكن إنشاء customer credit دون ربط العميل');
  assertPositiveMoney(input.amount, 'overpaymentAmount');
  const existing = (draft.customerCredits || []).filter((entry) => entry.idempotencyKey === input.paymentId && entry.entryType === 'created');
  if (existing.length > 0) return existing[0];
  const createdAt = input.createdAt || nowIso();
  const balanceBefore = calculateCustomerCreditBalance(entriesForCustomer(draft, input.customerId));
  const balanceAfter = round2(balanceBefore + input.amount);
  assertBalanceAfter(balanceBefore, 'created', round2(input.amount), balanceAfter);
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
    method: input.paymentMethod as CustomerCreditRecord['method'],
    reason: 'Overpayment',
    occurredAt: createdAt,
    balanceAfter
  };
  appendCredit(draft, record);
  return record;
}

export function getCustomerCreditSummaryInDraft(draft: AppData, customerId: string): CustomerCreditSummary {
  const entries = entriesForCustomer(draft, customerId);
  return {
    customerId,
    totalCreated: round2(entries.filter((entry) => entry.entryType === 'created').reduce((sum, entry) => sum + entry.amount, 0)),
    totalApplied: round2(entries.filter((entry) => entry.entryType === 'applied').reduce((sum, entry) => sum + entry.amount, 0)),
    totalRefunded: round2(entries.filter((entry) => entry.entryType === 'refunded').reduce((sum, entry) => sum + entry.amount, 0)),
    availableBalance: calculateCustomerCreditBalance(entries)
  };
}

export function getCustomerCreditHistoryInDraft(draft: AppData, customerId: string, filters: CustomerCreditHistoryFilters = {}): CustomerCreditRecord[] {
  const entries = entriesForCustomer(draft, customerId)
    .filter((entry) => !filters.entryType || entry.entryType === filters.entryType)
    .sort((left, right) => (right.occurredAt || right.createdAt).localeCompare(left.occurredAt || left.createdAt));
  return typeof filters.limit === 'number' ? entries.slice(0, Math.max(0, filters.limit)) : entries;
}

export function getCustomerCreditOperationInDraft(draft: AppData, operationId: string): CustomerCreditOperationResult | undefined {
  const records = (draft.customerCredits || []).filter((entry) => entry.operationId === operationId);
  return records.length > 0 ? resolveResult(records, true) : undefined;
}

export function applyCustomerCreditInDraft(draft: AppData, request: CustomerCreditApplyRequest): CustomerCreditOperationResult {
  const existing = (draft.customerCredits || []).filter((entry) => entry.idempotencyKey === request.idempotencyKey);
  if (existing.length > 0) return resolveIdempotent(existing, request);
  if (!request.actorId) throw new Error('منفذ العملية مطلوب');
  const invoice = draft.invoices.find((item) => item.id === request.targetInvoiceId);
  if (!invoice) throw new Error('الفاتورة المستهدفة غير موجودة');
  const order = draft.orders.find((item) => item.id === invoice.orderId);
  if (!order?.customerId) throw new Error('الفاتورة المستهدفة غير مرتبطة بعميل');
  const history = entriesForCustomer(draft, request.customerId);
  const sourceInvoiceId = history.some((entry) => entry.entryType === 'created' && entry.invoiceId === invoice.id) ? invoice.id : undefined;
  const availableBalance = getCustomerCreditSummaryInDraft(draft, request.customerId).availableBalance;
  assertApplicationTarget({
    customerId: request.customerId,
    targetInvoiceId: invoice.id,
    targetOrderId: invoice.orderId,
    targetInvoiceCustomerId: order.customerId,
    targetInvoiceStatus: order.status === 'cancelled' ? 'cancelled' : invoice.paymentStatus,
    targetRemainingAmount: invoice.remainingAmount,
    sourceInvoiceId,
    amount: request.amount,
    availableBalance,
    idempotencyKey: request.idempotencyKey
  });
  if (!request.reason.trim()) throw new Error('سبب تطبيق customer credit مطلوب');
  const allocations = allocateCreditFIFO(getFifoEntries(draft, request.customerId), request.amount);
  const operationId = createSafeId('CREDIT-APPLY');
  const now = nowIso();
  let balanceAfter = availableBalance;
  for (let index = 0; index < allocations.length; index += 1) {
    const allocation = allocations[index];
    balanceAfter = round2(balanceAfter - allocation.amount);
    assertBalanceAfter(balanceAfter + allocation.amount, 'applied', allocation.amount, balanceAfter);
    appendCredit(draft, {
      id: `${operationId}-${index + 1}`,
      customerId: request.customerId,
      entryType: 'applied',
      amount: allocation.amount,
      createdAt: now,
      operationId,
      idempotencyKey: request.idempotencyKey,
      sourceEntryId: allocation.sourceEntryId,
      invoiceId: invoice.id,
      orderId: invoice.orderId,
      targetInvoiceId: invoice.id,
      targetOrderId: invoice.orderId,
      method: 'customer_credit',
      actorId: request.actorId,
      reason: request.reason.trim(),
      occurredAt: now,
      balanceAfter
    });
  }
  const current = assertStoredPaymentAggregates(invoice.totalAmount, invoice.paidAmount, invoice.remainingAmount, invoice.payments || [], invoice.cancellationWriteoffAmount);
  const payment: PaymentRecord = {
    id: `${operationId}-PAYMENT`,
    invoiceId: invoice.id,
    orderId: invoice.orderId,
    amount: round2(request.amount),
    cashReceived: 0,
    overpaymentAmount: 0,
    paymentDate: now.slice(0, 10),
    method: 'customer_credit',
    note: request.reason.trim()
  };
  const payments = [...(invoice.payments || []), payment];
  const appliedPaid = round2(current.paidAmount + request.amount);
  const amounts = calculateOrderAmounts(invoice.totalAmount, appliedPaid);
  const writeoff = round2(Number(invoice.cancellationWriteoffAmount || 0));
  const remaining = round2(Math.max(0, amounts.remainingAmount - writeoff));
  invoice.payments = payments;
  invoice.paidAmount = amounts.paidAmount;
  invoice.remainingAmount = remaining;
  invoice.paymentStatus = remaining <= 0.0001 ? 'paid' : 'partial';
  invoice.cashReceived = Number(invoice.cashReceived || 0);
  invoice.overpaymentAmount = Number(invoice.overpaymentAmount || 0);
  order.paidAmount = invoice.paidAmount;
  order.remainingAmount = invoice.remainingAmount;
  order.cashReceived = invoice.cashReceived;
  order.overpaymentAmount = invoice.overpaymentAmount;
  return { operationId, idempotent: false, customerId: request.customerId, amount: round2(request.amount), entryType: 'applied', method: 'customer_credit', balanceAfter };
}

export function refundCustomerCreditInDraft(draft: AppData, request: CustomerCreditRefundRequest): CustomerCreditOperationResult {
  const existing = (draft.customerCredits || []).filter((entry) => entry.idempotencyKey === request.idempotencyKey);
  if (existing.length > 0) return resolveIdempotent(existing, request);
  assertRefundRequest({
    customerId: request.customerId,
    amount: request.amount,
    method: request.method,
    availableBalance: getCustomerCreditSummaryInDraft(draft, request.customerId).availableBalance,
    idempotencyKey: request.idempotencyKey,
    actorId: request.actorId || '',
    reason: request.reason
  });
  const availableBalance = getCustomerCreditSummaryInDraft(draft, request.customerId).availableBalance;
  assertCustomerCreditAmountWithinBalance(request.amount, availableBalance);
  const allocations = allocateCreditFIFO(getFifoEntries(draft, request.customerId), request.amount);
  const operationId = createSafeId('CREDIT-REFUND');
  const now = nowIso();
  let balanceAfter = availableBalance;
  for (let index = 0; index < allocations.length; index += 1) {
    const allocation = allocations[index];
    balanceAfter = round2(balanceAfter - allocation.amount);
    assertBalanceAfter(balanceAfter + allocation.amount, 'refunded', allocation.amount, balanceAfter);
    appendCredit(draft, {
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
    const cash: CashTransaction = {
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
    };
    assertCashTransactionContract(cash);
    if (!hasIdOrSourceId(draft.cashTransactions || [], cash.id, cash.sourceId)) draft.cashTransactions = [cash, ...(draft.cashTransactions || [])];
  }
  return { operationId, idempotent: false, customerId: request.customerId, amount: round2(request.amount), entryType: 'refunded', method: request.method, balanceAfter, cashTransactionId };
}
