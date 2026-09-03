import { AppData, Order, OrderMaterialUsage } from '../../types';
import { calculateOrderAmounts, materialSignature } from '../../domain/orderRules';
import { createSafeId } from '../../domain/idGenerator';
import { round2 } from '../shared/inventoryRules';
import { getInventoryMeta, insertStockMovementInDraft } from './inventoryMovementDraftAdapter';

export function updateOrderInvoiceInDraft(
  draft: AppData,
  updatedOrder: Order,
  totalAmount: number,
  paidAmount: number
): void {
  const existingInvoice = draft.invoices.find((invoice) => invoice.orderId === updatedOrder.id);
  if (!existingInvoice) throw new Error('لا توجد فاتورة مرتبطة بالطلب');
  const isCancelled = updatedOrder.status === 'cancelled' || Number(existingInvoice.cancellationWriteoffAmount || 0) > 0;
  const activeAmounts = calculateOrderAmounts(totalAmount, paidAmount);
  const remainingAmount = isCancelled ? Number(existingInvoice.remainingAmount) : activeAmounts.remainingAmount;
  const paymentStatus = isCancelled ? existingInvoice.paymentStatus : activeAmounts.paymentStatus;
  updatedOrder.remainingAmount = remainingAmount;
  draft.invoices = draft.invoices.map((invoice) => invoice.orderId === updatedOrder.id
    ? {
        ...invoice,
        customerName: updatedOrder.customerName,
        customerPhone: updatedOrder.customerPhone,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentStatus
      }
    : invoice);
}

export function updateOrderMaterialsInDraft(
  draft: AppData,
  existingOrder: Order,
  updatedOrder: Order,
  newMeters: number
): void {
  const oldUsages = (draft.orderMaterialUsages || []).filter((usage) => usage.orderId === existingOrder.id);
  const fabricChanged = existingOrder.fabricId !== updatedOrder.fabricId;
  const countChanged = existingOrder.garmentCount !== updatedOrder.garmentCount;
  const consumptionChanged = Math.abs(Number(existingOrder.fabricConsumptionMeters || 0) - newMeters) > 0.0001;
  const materialChanged = fabricChanged
    || countChanged
    || consumptionChanged
    || (updatedOrder.materialUsages !== undefined && materialSignature(oldUsages) !== materialSignature(updatedOrder.materialUsages || []));
  if (!materialChanged) return;

  const isCancelled = String(existingOrder.status) === 'cancelled';
  if (!isCancelled) {
    for (const usage of oldUsages) {
      if (!usage.itemId) throw new Error('مادة الطلب القديمة تفتقد معرف الصنف');
      insertStockMovementInDraft(draft, usage.itemType, usage.itemId, usage.quantity, 'return', 'إرجاع استهلاك مادة بعد تعديل الطلب', { type: 'order_update', id: existingOrder.id, number: existingOrder.orderNumber });
    }
  }
  draft.orderMaterialUsages = (draft.orderMaterialUsages || []).filter((usage) => usage.orderId !== existingOrder.id);

  const accessories = updatedOrder.materialUsages || oldUsages.filter((usage) => usage.itemType !== 'fabric');
  if (updatedOrder.fabricId) {
    const meta = getInventoryMeta(draft, 'fabric', updatedOrder.fabricId);
    const movement = isCancelled ? undefined : insertStockMovementInDraft(draft, 'fabric', updatedOrder.fabricId, -newMeters, 'sale', 'استهلاك قماش بعد تعديل الطلب', { type: 'order_update', id: existingOrder.id, number: existingOrder.orderNumber });
    const unitCost = fabricChanged ? meta.purchasePrice : existingOrder.fabricBuyPriceAtOrder || meta.purchasePrice;
    const usage: OrderMaterialUsage = {
      id: createSafeId('OMU-FABRIC-UPDATE'), orderId: existingOrder.id, itemType: 'fabric', itemId: updatedOrder.fabricId,
      itemName: updatedOrder.fabricName || meta.name, quantity: newMeters, unit: 'متر', unitCostAtUsage: unitCost,
      totalCost: round2(newMeters * unitCost), sourceMovementId: movement?.id, createdAt: new Date().toISOString()
    };
    draft.orderMaterialUsages = [ ...(draft.orderMaterialUsages || []), usage ];
  }

  for (const material of accessories) {
    const itemId = material.itemId || (material as any).item_id;
    const itemType = material.itemType || (material as any).item_type;
    if (!itemId || itemType === 'fabric') continue;
    const quantity = Number(material.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('كمية المادة المرتبطة بالطلب غير صحيحة');
    const meta = getInventoryMeta(draft, itemType, itemId);
    const movement = isCancelled ? undefined : insertStockMovementInDraft(draft, itemType, itemId, -quantity, 'sale', 'استهلاك مادة بعد تعديل الطلب', { type: 'order_update', id: existingOrder.id, number: existingOrder.orderNumber });
    const unitCost = Number(material.unitCostAtUsage ?? (material as any).unit_cost_at_usage ?? meta.purchasePrice);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('تكلفة المادة المرتبطة بالطلب غير صحيحة');
    draft.orderMaterialUsages = [ ...(draft.orderMaterialUsages || []), {
      id: createSafeId('OMU'), orderId: existingOrder.id, itemType, itemId,
      itemName: material.itemName || (material as any).item_name || meta.name,
      quantity, unit: material.unit || meta.unit, unitCostAtUsage: unitCost, totalCost: round2(quantity * unitCost),
      sourceMovementId: movement?.id, createdAt: new Date().toISOString()
    } as OrderMaterialUsage ];
  }
}

export function updateOrderFabricStockInDraft(
  draft: AppData,
  existingOrder: Order,
  updatedOrder: Order,
  newMeters: number
): void {
  updateOrderMaterialsInDraft(draft, existingOrder, updatedOrder, newMeters);
}
