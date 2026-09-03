import { describe, expect, it } from 'vitest';
import { AppData } from '../types';
import { updateOrderMaterialsInDraft } from '../services/adapters/orderUpdateAdapter';
import { applyPaymentToDraft } from '../services/adapters/paymentDraftAdapter';
import { insertStockMovementInDraft } from '../services/adapters/inventoryMovementDraftAdapter';
import { updateAccessoryInDraft, updateFabricInDraft } from '../services/adapters/inventoryCatalogDraftAdapter';
import { applyCashAdjustmentToDraft } from '../services/adapters/accountingDraftAdapter';

function makeData(): AppData {
  return {
    customers: [],
    orders: [{
      id: 'ORD-CONTRACT', orderNumber: 'CONTRACT-1', customerId: 'C1', customerName: 'عميل', customerPhone: '0500000000',
      thobeTypeId: 'T1', thobeTypeName: 'ثوب', fabricId: 'FAB-A', fabricName: 'A', fabricColor: 'أبيض', fabricConsumptionMeters: 3.5,
      fabricBuyPriceAtOrder: 10, garmentCount: 1, initialPaymentMethod: 'cash', orderDate: '2026-08-19', deliveryDate: '2026-08-20', status: 'cancelled',
      totalAmount: 300, paidAmount: 0, remainingAmount: 300, isCustomMeasurement: false, measurements: {} as any, styleDetails: {} as any, createdAt: '2026-08-19'
    }],
    invoices: [{ id: 'INV-CONTRACT', invoiceNumber: 'INV-CONTRACT', orderId: 'ORD-CONTRACT', customerName: 'عميل', customerPhone: '0500000000', orderDate: '2026-08-19', totalAmount: 300, paidAmount: 0, remainingAmount: 300, paymentStatus: 'unpaid', payments: [] }],
    fabrics: [{ id: 'FAB-A', name: 'A', color: 'أبيض', colorHex: '#fff', purchasePrice: 10, sellingPrice: 20, quantityMeters: 20, minStockMeters: 2 }],
    accessories: [{ id: 'ACC-A', name: 'زر', category: 'إكسسوار', purchasePrice: 2, sellingPrice: 4, quantity: 10, minStock: 1, unit: 'حبة' }],
    thobeTypes: [], colors: [], stockMovements: [], purchases: [], expenses: [], cashTransactions: [], orderMaterialUsages: [
      { id: 'USAGE-FAB', orderId: 'ORD-CONTRACT', itemType: 'fabric', itemId: 'FAB-A', itemName: 'A', quantity: 3.5, unit: 'متر', unitCostAtUsage: 10, totalCost: 35, createdAt: '2026-08-19' },
      { id: 'USAGE-ACC', orderId: 'ORD-CONTRACT', itemType: 'accessory', itemId: 'ACC-A', itemName: 'زر', quantity: 2, unit: 'حبة', unitCostAtUsage: 2, totalCost: 4, createdAt: '2026-08-19' }
    ], orderEvents: [], notifications: []
  };
}

describe('Mock/Production business contract', () => {
  it('rebuilds the new material snapshot without consuming it while cancelled, then consumes it on reactivate', () => {
    const draft = makeData();
    const order = draft.orders[0];
    const updated = { ...order, fabricId: 'FAB-A', garmentCount: 2, materialUsages: [{ itemType: 'accessory' as const, itemId: 'ACC-A', itemName: 'زر', quantity: 3, unit: 'حبة', unitCostAtUsage: 2 }] };
    updateOrderMaterialsInDraft(draft, order, updated, 7);
    expect(draft.fabrics[0].quantityMeters).toBe(20);
    expect(draft.accessories[0].quantity).toBe(10);
    expect(draft.orderMaterialUsages.some((usage) => usage.itemId === 'ACC-A' && usage.quantity === 3 && !usage.sourceMovementId)).toBe(true);
    for (const usage of draft.orderMaterialUsages) {
      const movement = insertStockMovementInDraft(draft, usage.itemType, usage.itemId!, -usage.quantity, 'sale', 'إعادة استهلاك مواد بعد الإلغاء', { type: 'order_reactivate', id: order.id });
      usage.sourceMovementId = movement.id;
    }
    expect(draft.fabrics[0].quantityMeters).toBe(13);
    expect(draft.accessories[0].quantity).toBe(7);
    expect(draft.orderMaterialUsages.every((usage) => Boolean(usage.sourceMovementId))).toBe(true);
  });

  it('rebuilds active material usage when the fabric consumption rate changes without a garment-count change', () => {
    const draft = makeData();
    const order = { ...draft.orders[0], status: 'new' as const };
    draft.orders[0] = order;
    updateOrderMaterialsInDraft(draft, order, { ...order, garmentCount: 1, materialUsages: [{ itemType: 'accessory' as const, itemId: 'ACC-A', itemName: 'زر', quantity: 2, unit: 'حبة', unitCostAtUsage: 2 }] }, 7);
    expect(draft.fabrics[0].quantityMeters).toBe(16.5);
    expect(draft.orderMaterialUsages.find((usage) => usage.itemType === 'fabric')?.quantity).toBe(7);
    expect(draft.orderMaterialUsages.find((usage) => usage.itemType === 'fabric')?.sourceMovementId).toBeTruthy();
  });

  it('rejects protected source types from Mock manual cash adjustments', () => {
    const draft = makeData();
    expect(() => applyCashAdjustmentToDraft(draft, {
      sourceType: 'customer_payment', sourceId: 'FORGED', direction: 'in', amount: 10,
      paymentMethod: 'cash', description: 'forged'
    })).toThrow();
    expect(draft.cashTransactions).toHaveLength(0);
  });

  it('preserves catalog quantity in Mock and changes it only through stock movement', () => {
    const draft = makeData();
    const originalFabricQuantity = draft.fabrics[0].quantityMeters;
    const originalAccessoryQuantity = draft.accessories[0].quantity;
    updateFabricInDraft(draft, { ...draft.fabrics[0], quantityMeters: 999, sellingPrice: 25 });
    updateAccessoryInDraft(draft, { ...draft.accessories[0], quantity: 999, sellingPrice: 5 });
    expect(draft.fabrics[0].quantityMeters).toBe(originalFabricQuantity);
    expect(draft.accessories[0].quantity).toBe(originalAccessoryQuantity);
    expect(draft.stockMovements).toHaveLength(0);
    insertStockMovementInDraft(draft, 'fabric', 'FAB-A', -2, 'sale', 'اختبار adjustment', { type: 'manual', id: 'ADJ-1' });
    expect(draft.fabrics[0].quantityMeters).toBe(originalFabricQuantity - 2);
    expect(draft.stockMovements).toHaveLength(1);
  });

  it('keeps payment aggregate derived from the payment ledger', () => {
    const draft = makeData();
    draft.orders[0].status = 'new';
    expect(applyPaymentToDraft(draft, 'INV-CONTRACT', 100, 'cash', 'test', 'PAY-CONTRACT')).toBe(true);
    expect(draft.invoices[0].paidAmount).toBe(100);
    expect(draft.invoices[0].payments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(100);
    expect(draft.orders[0].paidAmount).toBe(100);
    expect(applyPaymentToDraft(draft, 'INV-CONTRACT', 100, 'cash', 'test', 'PAY-CONTRACT')).toBe(false);
  });
});
