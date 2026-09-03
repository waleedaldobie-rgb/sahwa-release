import { AppData, InventoryItemType, StockMovement } from '../../types';
import { assertStoredPaymentAggregates } from '../../domain/paymentRules';
import { assertCashTransactionContract } from '../../domain/cashRules';
import { round2 } from '../shared/inventoryRules';

const nearlyEqual = (left: number, right: number) => Math.abs(left - right) <= 0.0001;
const numeric = (value: unknown) => {
  const result = Number(value || 0);
  if (!Number.isFinite(result)) throw new Error('قيمة مالية أو مخزنية غير رقمية');
  return result;
};

const assertMovement = (data: AppData, movement: StockMovement) => {
  const item = movement.itemType === 'fabric'
    ? data.fabrics.find((row) => row.id === movement.itemId)
    : data.accessories.find((row) => row.id === movement.itemId);
  if (!item) throw new Error(`حركة المخزون تشير إلى صنف غير موجود: ${movement.id}`);
  const quantity = numeric(movement.quantity);
  const before = numeric(movement.quantityBefore);
  const after = numeric(movement.quantityAfter);
  if (quantity <= 0 || before < 0 || after < 0) throw new Error(`حركة مخزون غير صالحة: ${movement.id}`);
  if (movement.direction === 'sale' && !nearlyEqual(after, before - quantity)) throw new Error(`حركة بيع لا تطابق رصيد المخزون: ${movement.id}`);
  if (movement.direction === 'purchase' || (movement.direction === 'return' && movement.referenceType !== 'purchase_return')) {
    if (!nearlyEqual(after, before + quantity)) throw new Error(`حركة إدخال لا تطابق رصيد المخزون: ${movement.id}`);
  }
  if (movement.direction === 'return' && movement.referenceType === 'purchase_return' && !nearlyEqual(after, before - quantity)) throw new Error(`إرجاع شراء لا يطابق رصيد المخزون: ${movement.id}`);
  if (movement.unitCost !== undefined) {
    const unitCost = numeric(movement.unitCost);
    if (unitCost < 0) throw new Error(`تكلفة حركة مخزون غير صالحة: ${movement.id}`);
    if (movement.totalCost !== undefined && !nearlyEqual(Number(movement.totalCost), quantity * unitCost)) throw new Error(`إجمالي تكلفة حركة مخزون غير مطابق: ${movement.id}`);
  }
};

export function assertMockBusinessIntegrity(data: AppData): void {
  const invoicesByOrder = new Map(data.invoices.map((invoice) => [invoice.orderId, invoice]));
  const ordersById = new Map(data.orders.map((order) => [order.id, order]));
  const customersById = new Set(data.customers.map((customer) => customer.id));
  const creditsById = new Set<string>();
  const createdCreditsByInvoice = new Map<string, number>();
  const operationSourceKeys = new Set<string>();
  const balanceByCustomer = new Map<string, number>();
  const invoicesById = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
  const cashRefundsByOperation = new Map<string, { count: number; total: number }>();
  for (const transaction of data.cashTransactions || []) {
    if (!['customer_refund', 'customer_credit_refund', 'withdrawal'].includes(transaction.sourceType) || transaction.direction !== 'out' || !transaction.sourceId) continue;
    const current = cashRefundsByOperation.get(transaction.sourceId) || { count: 0, total: 0 };
    current.count += 1;
    current.total = round2(current.total + Number(transaction.amount || 0));
    cashRefundsByOperation.set(transaction.sourceId, current);
  }

  const orderedCredits = [...(data.customerCredits || [])].sort((left, right) =>
    (left.occurredAt || left.createdAt).localeCompare(right.occurredAt || right.createdAt) || left.id.localeCompare(right.id)
  );
  for (const credit of orderedCredits) {
    const amount = numeric(credit.amount);
    if (!credit.id || creditsById.has(credit.id)) throw new Error(`معرف customer credit مكرر: ${credit.id}`);
    creditsById.add(credit.id);
    if (!customersById.has(credit.customerId)) throw new Error(`customer credit دون عميل: ${credit.id}`);
    if (!['created', 'applied', 'refunded'].includes(credit.entryType)) throw new Error(`نوع customer credit غير صالح: ${credit.id}`);
    if (amount <= 0) throw new Error(`مبلغ customer credit غير صالح: ${credit.id}`);
    if (credit.orderId && !ordersById.has(credit.orderId)) throw new Error(`customer credit يشير إلى طلب غير موجود: ${credit.id}`);
    if (credit.invoiceId && !invoicesById.has(credit.invoiceId)) throw new Error(`customer credit يشير إلى فاتورة غير موجودة: ${credit.id}`);
    if (credit.entryType === 'created' && credit.invoiceId) {
      createdCreditsByInvoice.set(credit.invoiceId, round2((createdCreditsByInvoice.get(credit.invoiceId) || 0) + amount));
    }

    if (credit.sourceEntryId) {
      const source = orderedCredits.find((entry) => entry.id === credit.sourceEntryId);
      if (!source || source.entryType !== 'created' || source.customerId !== credit.customerId) {
        throw new Error(`مصدر customer credit غير صالح: ${credit.id}`);
      }
      const sourceKey = `${credit.operationId || credit.id}:${credit.sourceEntryId}`;
      if (operationSourceKeys.has(sourceKey)) throw new Error(`خصم customer credit مكرر لنفس المصدر: ${credit.id}`);
      operationSourceKeys.add(sourceKey);
    }

    if (credit.targetInvoiceId) {
      const targetInvoice = invoicesById.get(credit.targetInvoiceId);
      const targetOrder = targetInvoice ? ordersById.get(targetInvoice.orderId) : undefined;
      if (!targetInvoice || !targetOrder || targetOrder.customerId !== credit.customerId || targetOrder.status === 'cancelled' || String(targetInvoice.paymentStatus) === 'cancelled') {
        throw new Error(`فاتورة هدف customer credit غير صالحة: ${credit.id}`);
      }
    }

    const previousBalance = round2(balanceByCustomer.get(credit.customerId) || 0);
    const sign = credit.entryType === 'created' ? 1 : -1;
    const expectedBalance = round2(previousBalance + sign * amount);
    if (expectedBalance < -0.0001) throw new Error(`رصيد customer credit أصبح سالباً: ${credit.id}`);
    if (credit.balanceAfter !== null && credit.balanceAfter !== undefined && !nearlyEqual(Number(credit.balanceAfter), Math.max(0, expectedBalance))) {
      throw new Error(`balance_after لا يطابق حركة customer credit: ${credit.id}`);
    }
    balanceByCustomer.set(credit.customerId, Math.max(0, expectedBalance));

    if (credit.entryType === 'refunded') {
      const cash = credit.operationId ? cashRefundsByOperation.get(credit.operationId) : undefined;
      if (credit.method === 'cash' && (!cash || cash.count === 0 || !nearlyEqual(cash.total, amount))) {
        throw new Error(`استرداد customer credit النقدي غير مرتبط بسجل النقد: ${credit.id}`);
      }
      if (credit.method !== 'cash' && cash && cash.count > 0) {
        throw new Error(`استرداد customer credit غير النقدي لديه حركة نقدية: ${credit.id}`);
      }
    }
  }

  for (const transaction of data.cashTransactions || []) {
    assertCashTransactionContract(transaction);
  }

  for (const invoice of data.invoices) {
    const order = ordersById.get(invoice.orderId);
    if (!order) throw new Error(`فاتورة دون طلب: ${invoice.id}`);
    const payments = invoice.payments || [];
    const ledger = assertStoredPaymentAggregates(invoice.totalAmount, invoice.paidAmount, invoice.remainingAmount, payments, invoice.cancellationWriteoffAmount);
    const cashReceived = round2(payments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0));
    const overpayment = round2(Math.max(0, cashReceived - Number(invoice.totalAmount)));
    const writeoff = numeric(invoice.cancellationWriteoffAmount);
    const expectedRemaining = round2(Math.max(0, Number(invoice.totalAmount) - ledger.paidAmount - writeoff));
    if (!nearlyEqual(Number(invoice.cashReceived || 0), cashReceived)) throw new Error(`cash_received لا يطابق payment ledger: ${invoice.id}`);
    if (!nearlyEqual(Number(invoice.overpaymentAmount || 0), overpayment)) throw new Error(`overpayment_amount لا يطابق payment ledger: ${invoice.id}`);
    if (!nearlyEqual(Number(invoice.remainingAmount), expectedRemaining)) throw new Error(`remaining_amount لا يطابق settlement contract: ${invoice.id}`);
    if (writeoff > 0 && order.status !== 'cancelled') throw new Error(`writeoff على طلب غير ملغى: ${invoice.id}`);
    if (order.status === 'cancelled' && Number(invoice.remainingAmount) > 0.0001) throw new Error(`طلب ملغى غير مسوى: ${invoice.id}`);
    const expectedStatus = order.status === 'cancelled' && writeoff > 0 ? 'settled_by_cancellation' : expectedRemaining <= 0.0001 ? 'paid' : ledger.paymentStatus;
    if (invoice.paymentStatus !== expectedStatus) throw new Error(`payment status لا يطابق settlement contract: ${invoice.id}`);
    if (!nearlyEqual(Number(order.paidAmount), Number(invoice.paidAmount)) || !nearlyEqual(Number(order.remainingAmount), Number(invoice.remainingAmount))) throw new Error(`order/invoice financial aggregates غير متطابقة: ${invoice.id}`);
    if (!nearlyEqual(Number(order.cashReceived || 0), Number(invoice.cashReceived || 0)) || !nearlyEqual(Number(order.overpaymentAmount || 0), Number(invoice.overpaymentAmount || 0))) throw new Error(`order/invoice cash aggregates غير متطابقة: ${invoice.id}`);
    if (!nearlyEqual(createdCreditsByInvoice.get(invoice.id) || 0, overpayment)) throw new Error(`customer credit لا يطابق overpayment: ${invoice.id}`);
  }

  for (const order of data.orders) {
    const invoice = invoicesByOrder.get(order.id);
    if (order.status === 'cancelled' && invoice && Number(order.remainingAmount) > 0.0001) throw new Error(`طلب ملغى remaining فيه أكبر من صفر: ${order.id}`);
    if (Number(order.cancellationWriteoffAmount || 0) > 0 && order.status !== 'cancelled') throw new Error(`writeoff على order نشط: ${order.id}`);
  }

  for (const movement of data.stockMovements || []) assertMovement(data, movement);
  const movementById = new Map((data.stockMovements || []).map((movement) => [movement.id, movement]));
  for (const usage of data.orderMaterialUsages || []) {
    const order = ordersById.get(usage.orderId);
    if (!order) throw new Error(`material usage دون order: ${usage.id}`);
    if (!Number.isFinite(Number(usage.quantity)) || Number(usage.quantity) <= 0) throw new Error(`material usage quantity غير صالحة: ${usage.id}`);
    if (!usage.sourceMovementId) {
      if (order.status !== 'cancelled') throw new Error(`material usage نشط دون source movement: ${usage.id}`);
      continue;
    }
    const movement = movementById.get(usage.sourceMovementId);
    if (!movement || movement.itemType !== usage.itemType || movement.itemId !== usage.itemId || movement.direction !== 'sale' || !nearlyEqual(Number(movement.quantity), Number(usage.quantity)) || movement.referenceId !== usage.orderId) {
      throw new Error(`source movement لا يطابق material usage: ${usage.id}`);
    }
  }

  for (const fabric of data.fabrics) if (!Number.isFinite(Number(fabric.quantityMeters)) || Number(fabric.quantityMeters) < 0) throw new Error(`رصيد قماش غير صالح: ${fabric.id}`);
  for (const accessory of data.accessories) if (!Number.isFinite(Number(accessory.quantity)) || Number(accessory.quantity) < 0) throw new Error(`رصيد إكسسوار غير صالح: ${accessory.id}`);
}

export type MockIntegrityItemType = InventoryItemType;
