import { OrderEvent, PaymentRecord } from '../../types';
import { CashRepository } from '../repositories/cashRepository';
import { CustomerCreditService } from './customerCreditService';
import { InvoiceRepository } from '../repositories/invoiceRepository';
import { OrderEventRepository } from '../repositories/orderEventRepository';
import { OrderWriteRepository } from '../repositories/orderWriteRepository';
import { assertStoredPaymentAggregates, assertValidPaymentMethod, calculatePaymentUpdate, parsePaymentLedger } from '../../domain/paymentRules';
import { createSafeId } from '../../domain/idGenerator';
import { round2 } from '../../domain/inventoryRules';

export class PaymentService {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly orderWriteRepository: OrderWriteRepository,
    private readonly cashRepository: CashRepository,
    private readonly customerCreditService: CustomerCreditService,
    private readonly eventRepository: OrderEventRepository,
    private readonly db: {
      transaction<T>(callback: () => T): () => T;
      prepare(sql: string): { get(...params: any[]): unknown };
    }
  ) {}

  addPayment(invoiceId: string, amount: number, method: string, note: string, paymentId?: string): boolean {
    const paymentMethod = assertValidPaymentMethod(method);
    const tx = this.db.transaction(() => {
      const invoice = this.invoiceRepository.findById(invoiceId);
      if (!invoice) throw new Error('الفاتورة غير موجودة');
      const order = this.db.prepare('SELECT status, customer_id FROM orders WHERE id = ?').get(invoice.order_id) as { status?: string; customer_id?: string } | undefined;
      if (order?.status === 'cancelled') throw new Error('لا يمكن تسجيل دفعة لطلب ملغى');
      if (!order?.customer_id) throw new Error('لا يمكن تسجيل دفعة دون ربط الطلب بعميل');

      const existingPayments: PaymentRecord[] = parsePaymentLedger(invoice.payments_json);
      const current = assertStoredPaymentAggregates(
        invoice.total_amount,
        invoice.paid_amount,
        invoice.remaining_amount,
        existingPayments,
        invoice.cancellation_writeoff_amount
      );
      const id = paymentId || createSafeId('PAY');
      if (existingPayments.some((payment) => payment.id === id) || this.cashRepository.findBySourceId(id)) return false;

      const paymentCalculation = calculatePaymentUpdate(
        invoice.total_amount,
        current.paidAmount,
        current.remainingAmount,
        amount
      );
      const {
        numericAmount,
        cashReceived,
        overpaymentAmount,
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        paymentStatus: newStatus
      } = paymentCalculation;
      const ledgerCashReceived = round2(existingPayments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0));
      const ledgerOverpayment = round2(existingPayments.reduce((sum, payment) => sum + Number(payment.overpaymentAmount ?? Math.max(0, Number(payment.cashReceived ?? payment.amount) - payment.amount)), 0));
      const newCashReceived = round2(ledgerCashReceived + cashReceived);
      const newOverpaymentAmount = round2(ledgerOverpayment + overpaymentAmount);
      const paymentDate = new Date().toISOString().slice(0, 10);
      const createdAt = new Date().toISOString();
      const newPayment: PaymentRecord = {
        id,
        invoiceId,
        orderId: invoice.order_id,
        amount: numericAmount,
        cashReceived,
        overpaymentAmount,
        paymentDate,
        method: paymentMethod,
        note
      };
      existingPayments.push(newPayment);

      this.invoiceRepository.updatePayment(
        invoiceId,
        newPaid,
        newRemaining,
        newStatus,
        JSON.stringify(existingPayments),
        newCashReceived,
        newOverpaymentAmount
      );
      this.orderWriteRepository.updatePayment(
        invoice.order_id,
        newPaid,
        newRemaining,
        newCashReceived,
        newOverpaymentAmount,
        Number(invoice.cancellation_writeoff_amount || 0)
      );
      this.cashRepository.insert({
        id: `CASH-PAY-${id}`,
        direction: 'in',
        sourceType: 'customer_payment',
        sourceId: id,
        orderId: invoice.order_id,
        referenceNumber: invoice.invoice_number,
        amount: cashReceived,
        paymentMethod,
        transactionDate: paymentDate,
        description: `دفعة عميل للفاتورة ${invoice.invoice_number}`,
        notes: note || undefined,
        actorId: 'system',
        reason: note?.trim() || 'تسجيل دفعة عميل',
        createdAt
      });
      if (overpaymentAmount > 0) {
        this.customerCreditService.createCreditFromOverpayment({
          customerId: order.customer_id,
          orderId: invoice.order_id,
          invoiceId,
          paymentId: id,
          amount: overpaymentAmount,
          paymentMethod,
          invoiceNumber: invoice.invoice_number,
          createdAt
        });
      }

      const event: OrderEvent = {
        id: `EVT-PAYMENT-${id}`,
        orderId: invoice.order_id,
        type: 'payment',
        title: 'تم تسجيل دفعة',
        description: `تم تسجيل دفعة بقيمة ${numericAmount} للفاتورة ${invoice.invoice_number}.`,
        actor: 'النظام',
        metadata: {
          paymentId: id,
          appliedPaid: numericAmount,
          cashReceived,
          overpaymentAmount,
          method: paymentMethod,
          remainingAmount: newRemaining,
          paymentStatus: newStatus
        },
        createdAt
      };
      this.eventRepository.insert(event);
      return true;
    });
    return tx();
  }
}
