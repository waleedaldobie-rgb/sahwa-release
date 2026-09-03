import { describe, expect, it } from 'vitest';
import { CustomerCreditService } from '../electron/services/customerCreditService';
import { applyCustomerCreditInDraft, createCustomerCreditFromOverpaymentInDraft, getCustomerCreditSummaryInDraft, refundCustomerCreditInDraft } from '../services/adapters/customerCreditDraftAdapter';
import type { AppData, CashTransaction, CustomerCreditApplyRequest, CustomerCreditRecord, CustomerCreditRefundRequest, Invoice, Order } from '../types';

const customerId = 'CUST-PARITY';
const actorId = 'USER-PARITY';

class InMemoryProductionCreditRepository {
  entries: CustomerCreditRecord[] = [];
  insert(record: CustomerCreditRecord) { this.entries.push({ ...record }); }
  getBalance(id: string) { return this.getSummary(id).availableBalance; }
  getSummary(id: string) {
    const entries = this.entries.filter((entry) => entry.customerId === id);
    const totalCreated = round(entries.filter((entry) => entry.entryType === 'created').reduce((sum, entry) => sum + entry.amount, 0));
    const totalApplied = round(entries.filter((entry) => entry.entryType === 'applied').reduce((sum, entry) => sum + entry.amount, 0));
    const totalRefunded = round(entries.filter((entry) => entry.entryType === 'refunded').reduce((sum, entry) => sum + entry.amount, 0));
    return { customerId: id, totalCreated, totalApplied, totalRefunded, availableBalance: round(totalCreated - totalApplied - totalRefunded) };
  }
  getHistory(id: string) { return this.entries.filter((entry) => entry.customerId === id).sort((a, b) => (a.occurredAt || a.createdAt).localeCompare(b.occurredAt || b.createdAt)); }
  getEntriesForFIFO(id: string) {
    const entries = this.entries.filter((entry) => entry.customerId === id);
    return entries.filter((entry) => entry.entryType === 'created').map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      amount: entry.amount,
      alreadyDebited: round(entries.filter((debit) => (debit.entryType === 'applied' || debit.entryType === 'refunded') && debit.sourceEntryId === entry.id).reduce((sum, debit) => sum + debit.amount, 0))
    }));
  }
  findByIdempotencyKey(key: string) { return this.entries.filter((entry) => entry.idempotencyKey === key); }
  getOperationById(operationId: string) { return this.entries.filter((entry) => entry.operationId === operationId); }
}

class InMemoryProductionInvoiceRepository {
  constructor(public invoices: Record<string, any>) {}
  findById(id: string) { return this.invoices[id]; }
  updatePayment(id: string, paidAmount: number, remainingAmount: number, paymentStatus: string, paymentsJson: string, cashReceived: number, overpaymentAmount: number) {
    const invoice = this.invoices[id];
    invoice.paid_amount = paidAmount;
    invoice.remaining_amount = remainingAmount;
    invoice.payment_status = paymentStatus;
    invoice.payments_json = paymentsJson;
    invoice.cash_received = cashReceived;
    invoice.overpayment_amount = overpaymentAmount;
    invoice.paidAmount = paidAmount;
    invoice.remainingAmount = remainingAmount;
    invoice.paymentStatus = paymentStatus;
    invoice.payments = JSON.parse(paymentsJson);
  }
}

class InMemoryProductionOrderRepository {
  constructor(public orders: Record<string, any>) {}
  updatePayment(id: string, paidAmount: number, remainingAmount: number, cashReceived: number, overpaymentAmount: number, cancellationWriteoffAmount: number) {
    const order = this.orders[id];
    order.paid_amount = paidAmount;
    order.remaining_amount = remainingAmount;
    order.cash_received = cashReceived;
    order.overpayment_amount = overpaymentAmount;
    order.cancellation_writeoff_amount = cancellationWriteoffAmount;
  }
}

class InMemoryProductionCashRepository {
  entries: CashTransaction[] = [];
  insert(entry: CashTransaction) { this.entries.push({ ...entry }); }
}

class InMemoryProductionDb {
  constructor(private readonly orders: Record<string, any>) {}
  exec(_sql: string) {}
  prepare(_sql: string) { return { get: (orderId: string) => this.orders[orderId] }; }
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const productionFixture = () => {
  const orders: Record<string, any> = {
    'ORD-TARGET': { id: 'ORD-TARGET', status: 'active', customer_id: customerId, paid_amount: 0, remaining_amount: 12, cash_received: 0, overpayment_amount: 0, cancellation_writeoff_amount: 0 }
  };
  const invoices: Record<string, any> = {
    'INV-TARGET': { id: 'INV-TARGET', order_id: 'ORD-TARGET', total_amount: 12, paid_amount: 0, remaining_amount: 12, cash_received: 0, overpayment_amount: 0, cancellation_writeoff_amount: 0, payment_status: 'unpaid', payments_json: '[]', payments: [] }
  };
  const creditRepository = new InMemoryProductionCreditRepository();
  const invoiceRepository = new InMemoryProductionInvoiceRepository(invoices);
  const orderRepository = new InMemoryProductionOrderRepository(orders);
  const cashRepository = new InMemoryProductionCashRepository();
  const service = new CustomerCreditService(creditRepository as any, invoiceRepository as any, orderRepository as any, cashRepository as any, new InMemoryProductionDb(orders) as any);
  service.createCreditFromOverpayment({ customerId, orderId: 'ORD-SOURCE-1', invoiceId: 'INV-SOURCE-1', paymentId: 'PAY-SOURCE-1', amount: 4, paymentMethod: 'cash', invoiceNumber: 'S-1', createdAt: '2026-08-20T10:00:00.000Z' });
  service.createCreditFromOverpayment({ customerId, orderId: 'ORD-SOURCE-2', invoiceId: 'INV-SOURCE-2', paymentId: 'PAY-SOURCE-2', amount: 8, paymentMethod: 'cash', invoiceNumber: 'S-2', createdAt: '2026-08-20T11:00:00.000Z' });
  return { service, creditRepository, invoiceRepository, orderRepository, cashRepository };
};

const mockFixture = () => {
  const data = {
    customers: [{ id: customerId, name: 'Parity', phone: '0500000000', createdAt: '2026-08-20', measurements: {}, styleDetails: {}, measurementHistory: [] }],
    orders: [{ id: 'ORD-TARGET', orderNumber: 'P-1', customerId, status: 'active', paidAmount: 0, remainingAmount: 12, cashReceived: 0, overpaymentAmount: 0, totalAmount: 12 }],
    invoices: [{ id: 'INV-TARGET', orderId: 'ORD-TARGET', invoiceNumber: 'T-1', totalAmount: 12, paidAmount: 0, remainingAmount: 12, cashReceived: 0, overpaymentAmount: 0, cancellationWriteoffAmount: 0, paymentStatus: 'unpaid', payments: [] }],
    customerCredits: [], cashTransactions: [], fabrics: [], accessories: [], thobeTypes: [], colors: [], notifications: [], stockMovements: [], purchases: [], expenses: [], orderMaterialUsages: [], orderEvents: []
  } as unknown as AppData;
  createCustomerCreditFromOverpaymentInDraft(data, { customerId, orderId: 'ORD-SOURCE-1', invoiceId: 'INV-SOURCE-1', paymentId: 'PAY-SOURCE-1', amount: 4, paymentMethod: 'cash', invoiceNumber: 'S-1', createdAt: '2026-08-20T10:00:00.000Z' });
  createCustomerCreditFromOverpaymentInDraft(data, { customerId, orderId: 'ORD-SOURCE-2', invoiceId: 'INV-SOURCE-2', paymentId: 'PAY-SOURCE-2', amount: 8, paymentMethod: 'cash', invoiceNumber: 'S-2', createdAt: '2026-08-20T11:00:00.000Z' });
  return data;
};

const normalizeResult = (result: any) => ({
  idempotent: result.idempotent,
  customerId: result.customerId,
  amount: result.amount,
  entryType: result.entryType,
  method: result.method,
  balanceAfter: result.balanceAfter,
  hasCashTransaction: Boolean(result.cashTransactionId)
});

const applyRequest: CustomerCreditApplyRequest = { customerId, targetInvoiceId: 'INV-TARGET', amount: 10, idempotencyKey: 'PARITY-APPLY-1', reason: 'تطبيق رصيد', actorId };
const cashRefundRequest: CustomerCreditRefundRequest = { customerId, amount: 1, method: 'cash', idempotencyKey: 'PARITY-REFUND-CASH-1', reason: 'استرداد نقدي', actorId };
const cardRefundRequest: CustomerCreditRefundRequest = { customerId, amount: 1, method: 'card', idempotencyKey: 'PARITY-REFUND-CARD-1', reason: 'استرداد بطاقة', actorId };

const expectBothReject = (production: () => unknown, mock: () => unknown) => {
  expect(production).toThrow();
  expect(mock).toThrow();
};

describe('Production/Mock Customer Credit parity', () => {
  it('matches overpayment creation and available liability', () => {
    const production = productionFixture();
    const mock = mockFixture();
    expect(production.creditRepository.getSummary(customerId)).toEqual(getCustomerCreditSummaryInDraft(mock, customerId));
    expect(production.creditRepository.getSummary(customerId).availableBalance).toBe(12);
  });

  it('matches FIFO non-cash apply, invoice aggregates, and idempotent retry', () => {
    const production = productionFixture();
    const mock = mockFixture();
    const productionResult = production.service.applyCredit(applyRequest);
    const mockResult = applyCustomerCreditInDraft(mock, applyRequest);
    expect(normalizeResult(productionResult)).toEqual(normalizeResult(mockResult));
    expect(productionResult.balanceAfter).toBe(2);
    expect(production.creditRepository.entries.filter((entry) => entry.entryType === 'applied')).toHaveLength(2);
    expect(mock.customerCredits.filter((entry) => entry.entryType === 'applied')).toHaveLength(2);
    expect(production.invoiceRepository.invoices['INV-TARGET']).toMatchObject({ paid_amount: 10, remaining_amount: 2, cash_received: 0 });
    expect(mock.invoices[0]).toMatchObject({ paidAmount: 10, remainingAmount: 2, cashReceived: 0 });
    expect(production.cashRepository.entries).toHaveLength(0);
    expect(mock.cashTransactions).toHaveLength(0);
    expect(normalizeResult(production.service.applyCredit(applyRequest))).toEqual(normalizeResult(applyCustomerCreditInDraft(mock, applyRequest)));
    expect(production.service.applyCredit(applyRequest).idempotent).toBe(true);
  });

  it('matches cash and non-cash refund effects and idempotency', () => {
    const production = productionFixture();
    const mock = mockFixture();
    production.service.applyCredit(applyRequest);
    applyCustomerCreditInDraft(mock, applyRequest);
    expect(normalizeResult(production.service.refundCredit(cashRefundRequest))).toEqual(normalizeResult(refundCustomerCreditInDraft(mock, cashRefundRequest)));
    expect(production.cashRepository.entries).toHaveLength(1);
    expect(mock.cashTransactions).toHaveLength(1);
    expect(normalizeResult(production.service.refundCredit(cardRefundRequest))).toEqual(normalizeResult(refundCustomerCreditInDraft(mock, cardRefundRequest)));
    expect(production.cashRepository.entries).toHaveLength(1);
    expect(mock.cashTransactions).toHaveLength(1);
    expect(normalizeResult(production.service.refundCredit(cashRefundRequest))).toEqual(normalizeResult(refundCustomerCreditInDraft(mock, cashRefundRequest)));
  });

  it('matches rejection rules for source/cancelled/completed/invalid refund requests', () => {
    const sourceProduction = productionFixture();
    const sourceMock = mockFixture();
    const sourceRequest = { ...applyRequest, targetInvoiceId: 'INV-SOURCE-1' };
    expectBothReject(() => sourceProduction.service.applyCredit(sourceRequest), () => applyCustomerCreditInDraft(sourceMock, sourceRequest));

    const cancelledProduction = productionFixture();
    const cancelledMock = mockFixture();
    cancelledProduction.orderRepository.orders['ORD-TARGET'].status = 'cancelled';
    cancelledMock.orders[0].status = 'cancelled';
    expectBothReject(() => cancelledProduction.service.applyCredit(applyRequest), () => applyCustomerCreditInDraft(cancelledMock, applyRequest));

    const completedProduction = productionFixture();
    const completedMock = mockFixture();
    completedProduction.invoiceRepository.invoices['INV-TARGET'].payment_status = 'paid';
    completedProduction.invoiceRepository.invoices['INV-TARGET'].remaining_amount = 0;
    completedMock.invoices[0].paymentStatus = 'paid';
    completedMock.invoices[0].remainingAmount = 0;
    expectBothReject(() => completedProduction.service.applyCredit(applyRequest), () => applyCustomerCreditInDraft(completedMock, applyRequest));

    const invalidRefundProduction = productionFixture();
    const invalidRefundMock = mockFixture();
    expectBothReject(() => invalidRefundProduction.service.refundCredit({ ...cashRefundRequest, method: 'customer_credit' as any }), () => refundCustomerCreditInDraft(invalidRefundMock, { ...cashRefundRequest, method: 'customer_credit' as any }));
    expectBothReject(() => invalidRefundProduction.service.refundCredit({ ...cashRefundRequest, amount: 99 }), () => refundCustomerCreditInDraft(invalidRefundMock, { ...cashRefundRequest, amount: 99 }));
    expectBothReject(() => invalidRefundProduction.service.refundCredit({ ...cashRefundRequest, reason: '', actorId: undefined }), () => refundCustomerCreditInDraft(invalidRefundMock, { ...cashRefundRequest, reason: '', actorId: undefined }));
  });
});
