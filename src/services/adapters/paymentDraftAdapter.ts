import { AppData, CashTransaction, OrderEvent, PaymentRecord } from '../../types';
import { assertStoredPaymentAggregates, assertValidPaymentMethod, calculatePaymentUpdate } from '../../domain/paymentRules';
import { createSafeId } from '../../domain/idGenerator';
import { findById, hasIdOrSourceId } from '../shared/idempotencyRules';
import { createCustomerCreditFromOverpaymentInDraft } from './customerCreditDraftAdapter';
import { assertCashTransactionContract } from '../../domain/cashRules';

export function applyPaymentToDraft(
  draft: AppData,
  invoiceId: string,
  amount: number,
  method: string,
  note: string,
  paymentId?: string
): boolean {
  const paymentMethod = assertValidPaymentMethod(method);
  const invoice = draft.invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw new Error('الفاتورة غير موجودة');
  const order = draft.orders.find((item) => item.id === invoice.orderId);
  if (order?.status === 'cancelled') throw new Error('لا يمكن تسجيل دفعة لطلب ملغى');
  if (!order?.customerId) throw new Error('لا يمكن تسجيل دفعة دون ربط الطلب بعميل');

  const current = assertStoredPaymentAggregates(
    invoice.totalAmount,
    invoice.paidAmount,
    invoice.remainingAmount,
    invoice.payments || [],
    invoice.cancellationWriteoffAmount
  );
  const { numericAmount, cashReceived, overpaymentAmount, paidAmount, remainingAmount, paymentStatus } = calculatePaymentUpdate(
    invoice.totalAmount,
    current.paidAmount,
    current.remainingAmount,
    amount
  );
  const id = paymentId || createSafeId('PAY');
  if ((invoice.payments || []).some((payment) => payment.id === id) || hasIdOrSourceId(draft.cashTransactions || [], `CASH-PAY-${id}`, id)) {
    return false;
  }

  const now = new Date().toISOString();
  const payment: PaymentRecord = {
    id,
    invoiceId,
    orderId: invoice.orderId,
    amount: numericAmount,
    cashReceived,
    overpaymentAmount,
    paymentDate: now.slice(0, 10),
    method: paymentMethod,
    note
  };
  const payments = [...(invoice.payments || []), payment];
  const ledgerCashReceived = payments.reduce((sum, entry) => sum + Number(entry.cashReceived ?? entry.amount), 0);
  const ledgerOverpayment = payments.reduce((sum, entry) => sum + Number(entry.overpaymentAmount ?? 0), 0);
  invoice.payments = payments;
  invoice.paidAmount = paidAmount;
  invoice.remainingAmount = remainingAmount;
  invoice.cashReceived = ledgerCashReceived;
  invoice.overpaymentAmount = ledgerOverpayment;
  invoice.paymentStatus = paymentStatus;

  if (order) {
    order.paidAmount = paidAmount;
    order.remainingAmount = remainingAmount;
    order.cashReceived = ledgerCashReceived;
    order.overpaymentAmount = ledgerOverpayment;
  }

  const cash: CashTransaction = {
    id: `CASH-PAY-${id}`,
    direction: 'in',
    sourceType: 'customer_payment',
    sourceId: id,
    orderId: invoice.orderId,
    referenceNumber: invoice.invoiceNumber,
    amount: cashReceived,
    paymentMethod,
    transactionDate: payment.paymentDate,
    description: `دفعة عميل للفاتورة ${invoice.invoiceNumber}`,
    notes: note || undefined,
    actorId: 'system',
    reason: note?.trim() || 'تسجيل دفعة عميل',
    createdAt: now
  };
  assertCashTransactionContract(cash);
  if (!hasIdOrSourceId(draft.cashTransactions || [], cash.id, cash.sourceId)) {
    draft.cashTransactions = [cash, ...(draft.cashTransactions || [])];
  }

  if (overpaymentAmount > 0) {
    createCustomerCreditFromOverpaymentInDraft(draft, {
      customerId: order.customerId,
      orderId: invoice.orderId,
      invoiceId,
      paymentId: id,
      amount: overpaymentAmount,
      paymentMethod,
      invoiceNumber: invoice.invoiceNumber,
      createdAt: now
    });
  }

  const event: OrderEvent = {
    id: `EVT-PAYMENT-${id}`,
    orderId: invoice.orderId,
    type: 'payment',
    title: 'تم تسجيل دفعة',
    description: `تم تسجيل دفعة بقيمة ${numericAmount} للفاتورة ${invoice.invoiceNumber}.`,
    actor: 'النظام',
    metadata: { paymentId: id, appliedPaid: numericAmount, cashReceived, overpaymentAmount, method: paymentMethod, remainingAmount, paymentStatus },
    createdAt: now
  };
  if (!findById(draft.orderEvents || [], event.id)) {
    draft.orderEvents = [event, ...(draft.orderEvents || [])];
  }

  return true;
}
