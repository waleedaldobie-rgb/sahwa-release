import { AppData, Order, OrderMaterialUsage, OrderMaterialUsageInput, StockMovement } from '../../types';
import { calculateMaterialCost, calculateOrderAmounts } from '../../domain/orderRules';
import { calculatePaymentUpdate } from '../../domain/paymentRules';
import { createSafeId } from '../../domain/idGenerator';
import { normalizeMeasurements, normalizeStyleDetails } from '../shared/measurementDefaults';
import { round2 } from '../shared/inventoryRules';

type MaterialContext = {
  name: string;
  unit: string;
  purchasePrice: number;
};

type OrderBuildContext = {
  orderId: string;
  orderNumber: string;
  requiredMeters: number;
  fabricBuyPrice: number;
  garmentCount: number;
  totalAmount: number;
  paidAmount: number;
  cashReceived: number;
  overpaymentAmount: number;
  materialUsages: OrderMaterialUsage[];
  materialCost: number;
  createdAt: string;
};

export function buildFabricMaterialUsage(
  orderId: string,
  itemId: string,
  itemName: string,
  quantity: number,
  unitCostAtUsage: number,
  movement: StockMovement,
  createdAt: string
): OrderMaterialUsage {
  return {
    id: createSafeId('OMU-FABRIC'),
    orderId,
    itemType: 'fabric',
    itemId,
    itemName: itemName || 'قماش',
    quantity,
    unit: 'متر',
    unitCostAtUsage,
    totalCost: round2(quantity * unitCostAtUsage),
    sourceMovementId: movement.id,
    createdAt
  };
}

export function buildMaterialUsage(
  orderId: string,
  material: OrderMaterialUsageInput | OrderMaterialUsage,
  context: MaterialContext,
  movement: StockMovement,
  createdAt: string
): OrderMaterialUsage {
  const quantity = Number(material.quantity);
  const unitCostAtUsage = Number(material.unitCostAtUsage ?? context.purchasePrice ?? 0);
  return {
    id: createSafeId('OMU'),
    orderId,
    itemType: material.itemType,
    itemId: material.itemId,
    itemName: material.itemName || context.name,
    quantity,
    unit: material.unit || context.unit,
    unitCostAtUsage,
    totalCost: round2(quantity * unitCostAtUsage),
    sourceMovementId: movement.id,
    createdAt
  };
}

export function appendMaterialUsage(draft: AppData, usage: OrderMaterialUsage): void {
  draft.orderMaterialUsages = [...(draft.orderMaterialUsages || []), usage];
}

export function calculateOrderMaterialCost(materialUsages: OrderMaterialUsage[]): number {
  return calculateMaterialCost(materialUsages);
}

export function buildOrderDraft(orderData: Partial<Order>, context: OrderBuildContext): Order {
  const {
    orderId,
    orderNumber,
    requiredMeters,
    fabricBuyPrice,
    garmentCount,
    totalAmount,
    paidAmount,
    cashReceived,
    overpaymentAmount,
    materialUsages,
    materialCost,
    createdAt
  } = context;

  return {
    id: orderId,
    orderNumber,
    customerId: orderData.customerId || '',
    customerName: orderData.customerName || '',
    customerPhone: orderData.customerPhone || '',
    thobeTypeId: orderData.thobeTypeId || '',
    thobeTypeName: orderData.thobeTypeName || 'ثوب',
    fabricId: orderData.fabricId || '',
    fabricName: orderData.fabricName || '',
    fabricColor: orderData.fabricColor || '',
    fabricConsumptionMeters: requiredMeters,
    fabricBuyPriceAtOrder: fabricBuyPrice,
    garmentCount,
    initialPaymentMethod: orderData.initialPaymentMethod || 'cash',
    materialUsages,
    materialCost,
    profit: round2(totalAmount - materialCost),
    orderDate: orderData.orderDate || createdAt.slice(0, 10),
    deliveryDate: orderData.deliveryDate || createdAt.slice(0, 10),
    status: orderData.status || 'new',
    totalAmount,
    paidAmount,
    remainingAmount: round2(totalAmount - paidAmount),
    cashReceived,
    overpaymentAmount,
    isCustomMeasurement: Boolean(orderData.isCustomMeasurement),
    measurements: normalizeMeasurements(orderData.measurements),
    styleDetails: normalizeStyleDetails(orderData.styleDetails),
    notes: orderData.notes || '',
    createdAt
  };
}

export function buildInitialInvoiceDraft(
  orderData: Partial<Order>,
  orderId: string,
  orderNumber: string,
  totalAmount: number,
  paidAmount: number,
  visibleInvoiceNumber: number
) {
  const invoiceId = `INV-${orderNumber}`;
  const settlement = paidAmount > 0
    ? calculatePaymentUpdate(totalAmount, 0, totalAmount, paidAmount)
    : { numericAmount: 0, cashReceived: 0, overpaymentAmount: 0, ...calculateOrderAmounts(totalAmount, 0) };
  const paymentStatus = settlement.paymentStatus;
  const paymentId = settlement.cashReceived > 0 ? createSafeId('PAY') : undefined;
  const payment = paymentId
    ? {
        id: paymentId,
        invoiceId,
        orderId,
        amount: settlement.numericAmount,
        cashReceived: settlement.cashReceived,
        overpaymentAmount: settlement.overpaymentAmount,
        paymentDate: orderData.orderDate || new Date().toISOString().slice(0, 10),
        method: orderData.initialPaymentMethod || 'cash',
        note: 'دفعة أولى عند إنشاء الطلب'
      }
    : undefined;

  return {
    invoice: {
      id: invoiceId,
      invoiceNumber: invoiceId,
      visibleInvoiceNumber,
      customerNumber: orderData.customerNumber,
      orderId,
      customerName: orderData.customerName || '',
      customerPhone: orderData.customerPhone || '',
      orderDate: orderData.orderDate || new Date().toISOString().slice(0, 10),
      totalAmount,
      paidAmount: settlement.paidAmount,
      remainingAmount: settlement.remainingAmount,
      paymentStatus,
      cashReceived: settlement.cashReceived,
      overpaymentAmount: settlement.overpaymentAmount,
      payments: payment ? [payment] : []
    },
    payment,
    settlement
  };
}
