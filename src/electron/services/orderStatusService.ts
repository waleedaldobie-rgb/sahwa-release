import { OrderEvent, OrderStatus } from '../../types';
import { OrderEventRepository } from '../repositories/orderEventRepository';
import { OrderRepository } from '../repositories/orderRepository';
import { OrderWriteRepository } from '../repositories/orderWriteRepository';
import { InventoryService } from './inventoryService';
import { createSafeId } from '../../domain/idGenerator';
import { ALLOWED_ORDER_STATUS_TRANSITIONS, assertValidOrderStatus, calculateCancellationSettlement } from '../../domain/orderRules';
import { assertStoredPaymentAggregates, parsePaymentLedger } from '../../domain/paymentRules';
import { round2 } from '../../domain/inventoryRules';
import { InvoiceRepository } from '../repositories/invoiceRepository';


export class OrderStatusService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly orderWriteRepository: OrderWriteRepository,
    private readonly inventoryService: InventoryService,
    private readonly eventRepository: OrderEventRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly db: { transaction<T>(callback: () => T): () => T }
  ) {}

  updateStatus(orderId: string, status: string): boolean {
    const validatedStatus = assertValidOrderStatus(status);
    const tx = this.db.transaction(() => {
      const order = this.orderRepository.findById(orderId);
      if (!order) return false;
      if (order.status === validatedStatus) return true;
      if (!ALLOWED_ORDER_STATUS_TRANSITIONS[order.status as OrderStatus]?.includes(validatedStatus)) {
        throw new Error(`انتقال حالة الطلب من ${order.status} إلى ${status} غير مسموح`);
      }

      const materials = this.orderRepository.listMaterialUsages(orderId);
      const previousRemainingAmount = Number(order.remaining_amount || 0);
      let cancellationWriteoffAmount = 0;
      let cancellationPaymentStatus: 'paid' | 'settled_by_cancellation' | undefined;
      if (validatedStatus === 'cancelled') {
        const invoice = this.invoiceRepository.findByOrderId(orderId);
        if (invoice) {
          const payments = parsePaymentLedger(invoice.payments_json);
          const ledger = assertStoredPaymentAggregates(
            invoice.total_amount,
            invoice.paid_amount,
            invoice.remaining_amount,
            payments,
            invoice.cancellation_writeoff_amount
          );
          const cashReceived = round2(payments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0));
          const overpaymentAmount = round2(payments.reduce((sum, payment) => sum + Number(payment.overpaymentAmount ?? Math.max(0, Number(payment.cashReceived ?? payment.amount) - payment.amount)), 0));
          const settlement = calculateCancellationSettlement({
            invoiceTotal: invoice.total_amount,
            appliedPaid: ledger.paidAmount,
            cashReceived,
            cancellationWriteoffAmount: Math.max(0, Number(invoice.total_amount) - ledger.paidAmount),
            customerId: order.customer_id
          });
          cancellationWriteoffAmount = settlement.cancellationWriteoffAmount;
          cancellationPaymentStatus = settlement.paymentStatus;
          this.orderWriteRepository.updatePayment(orderId, ledger.paidAmount, settlement.remainingAmount, cashReceived, overpaymentAmount, cancellationWriteoffAmount);
          this.invoiceRepository.updateAmounts(orderId, invoice.total_amount, ledger.paidAmount, settlement.remainingAmount, settlement.paymentStatus, cashReceived, overpaymentAmount, cancellationWriteoffAmount);
        }

        for (const material of materials) {
          if (material.item_id) {
            this.inventoryService.recordMovement(material.item_type, material.item_id, material.quantity, 'return', 'إرجاع مواد بسبب إلغاء الطلب', {
              type: 'order_cancel', id: orderId, number: order.order_number
            }, {
              unitCost: material.unit_cost_at_usage,
              sourceMovementId: material.source_movement_id || undefined,
              actorId: 'system',
              updateWac: false
            });
          }
          this.orderWriteRepository.updateMaterialUsageSourceMovement(material.id, null);
        }
      } else if (order.status === 'cancelled' && validatedStatus === 'new') {
        for (const material of materials) {
          if (!material.item_id) continue;
          const movement = this.inventoryService.recordMovement(material.item_type, material.item_id, -material.quantity, 'sale', 'إعادة استهلاك مواد بعد إلغاء الإلغاء', {
            type: 'order_reactivate', id: orderId, number: order.order_number
          });
          this.orderWriteRepository.updateMaterialUsageSourceMovement(material.id, movement.id);
        }
      }

      const updatedAt = new Date().toISOString();
      this.orderWriteRepository.updateStatus(orderId, validatedStatus, updatedAt);
      const event: OrderEvent = {
        id: createSafeId(`EVT-STATUS-${orderId}`),
        orderId,
        type: 'status_changed',
        title: `تغيير الحالة إلى ${validatedStatus}`,
        description: `تم تغيير حالة الطلب من ${order.status} إلى ${validatedStatus}${validatedStatus === 'cancelled' ? ' مع إعادة المواد للمخزون' : order.status === 'cancelled' ? ' مع إعادة استهلاك المواد' : ''}.`,
        fromStatus: order.status,
        toStatus: validatedStatus,
        actor: 'النظام',
        metadata: validatedStatus === 'cancelled' ? {
          previousRemainingAmount,
          cancellationWriteoffAmount,
          paymentStatus: cancellationPaymentStatus || 'paid',
          cashReversalCreated: false
        } : undefined,
        createdAt: updatedAt
      };
      this.eventRepository.insert(event);
      return true;
    });
    return tx();
  }
}
