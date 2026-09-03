import { AppData, PaymentSettlementStatus } from '../../types';
import { assertStoredPaymentAggregates } from '../../domain/paymentRules';
import { calculateCancellationSettlement } from '../../domain/orderRules';
import { round2 } from '../shared/inventoryRules';

export interface MockCancellationSettlement {
  remainingAmount: number;
  cancellationWriteoffAmount: number;
  paymentStatus: Extract<PaymentSettlementStatus, 'paid' | 'settled_by_cancellation'>;
  cashReceived: number;
  overpaymentAmount: number;
}

export function settleCancelledOrderInDraft(draft: AppData, orderId: string): MockCancellationSettlement {
  const order = draft.orders.find((item) => item.id === orderId);
  if (!order) throw new Error('الطلب غير موجود في البيانات المحلية');
  const invoice = draft.invoices.find((item) => item.orderId === orderId);
  if (!invoice) {
    order.cancellationWriteoffAmount = 0;
    return { remainingAmount: order.remainingAmount, cancellationWriteoffAmount: 0, paymentStatus: 'paid', cashReceived: Number(order.cashReceived || 0), overpaymentAmount: Number(order.overpaymentAmount || 0) };
  }
  const payments = invoice.payments || [];
  const ledger = assertStoredPaymentAggregates(invoice.totalAmount, invoice.paidAmount, invoice.remainingAmount, payments, invoice.cancellationWriteoffAmount);
  const cashReceived = round2(payments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0));
  const overpaymentAmount = round2(payments.reduce((sum, payment) => sum + Number(payment.overpaymentAmount ?? 0), 0));
  const settlement = calculateCancellationSettlement({
    invoiceTotal: invoice.totalAmount,
    appliedPaid: ledger.paidAmount,
    cashReceived,
    cancellationWriteoffAmount: Math.max(0, Number(invoice.totalAmount) - ledger.paidAmount),
    customerId: order.customerId
  });
  invoice.paidAmount = ledger.paidAmount;
  invoice.remainingAmount = settlement.remainingAmount;
  invoice.cashReceived = cashReceived;
  invoice.overpaymentAmount = overpaymentAmount;
  invoice.cancellationWriteoffAmount = settlement.cancellationWriteoffAmount;
  invoice.paymentStatus = settlement.paymentStatus;
  order.paidAmount = ledger.paidAmount;
  order.remainingAmount = settlement.remainingAmount;
  order.cashReceived = cashReceived;
  order.overpaymentAmount = overpaymentAmount;
  order.cancellationWriteoffAmount = settlement.cancellationWriteoffAmount;
  return { ...settlement, cashReceived, overpaymentAmount };
}
