import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, initElectronMock } from '../services/electronMock';
import type { AppData } from '../types';

const seed = (): AppData => ({
  customers: [],
  orders: [],
  invoices: [],
  fabrics: [{ id: 'FAB-WAC', name: 'قماش WAC', color: 'أبيض', purchasePrice: 10, sellingPrice: 100, quantityMeters: 10, minStockMeters: 2 }],
  accessories: [{ id: 'ACC-WAC', name: 'زر WAC', category: 'اختبار', quantity: 10, minStock: 2, unit: 'حبة', purchasePrice: 2 }],
  thobeTypes: [],
  colors: [],
  notifications: [],
  stockMovements: [],
  purchases: [],
  expenses: [],
  cashTransactions: [],
  orderMaterialUsages: [],
  orderEvents: [],
  customerCredits: []
});

describe('Inventory/WAC returns and Cash whitelist hardening', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
    storage.clear();
    initElectronMock();
    storage.setItem('sahwa_tailoring_app_data_v1', JSON.stringify(seed()));
    initElectronMock();
  });

  it('updates WAC with four-decimal precision after weighted purchase', async () => {
    await window.electronAPI.createPurchase({
      id: 'PUR-WAC-1', supplier: 'مورد WAC', purchaseDate: '2026-08-20', paymentMethod: 'cash',
      lines: [{ itemType: 'fabric', itemId: 'FAB-WAC', itemName: 'قماش WAC', quantity: 10, unit: 'متر', unitPrice: 20 }]
    });
    const data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(20);
    expect(data.fabrics[0].purchasePrice).toBe(15);
    expect(data.stockMovements.find((movement) => movement.referenceId === 'PUR-WAC-1')).toMatchObject({ unitCost: 20, totalCost: 200 });
  });

  it('returns purchase quantity using original movement cost and updates WAC without retroactive snapshot changes', async () => {
    await window.electronAPI.createPurchase({
      id: 'PUR-WAC-2', supplier: 'مورد WAC', purchaseDate: '2026-08-20', paymentMethod: 'cash',
      lines: [{ itemType: 'fabric', itemId: 'FAB-WAC', itemName: 'قماش WAC', quantity: 10, unit: 'متر', unitPrice: 20 }]
    });
    const beforeReturn = await window.electronAPI.getData();
    const original = beforeReturn.stockMovements.find((movement) => movement.referenceId === 'PUR-WAC-2');
    expect(original?.unitCost).toBe(20);
    await window.electronAPI.returnPurchase?.({
      itemType: 'fabric',
      itemId: 'FAB-WAC',
      quantity: 5,
      reason: 'إرجاع شراء جزئي',
      originalMovementId: original?.id,
      purchaseId: 'PUR-WAC-2-RETURN',
      actorId: 'warehouse-user',
    });
    const afterReturn = await window.electronAPI.getData();
    const returned = afterReturn.stockMovements.find((movement) => movement.referenceType === 'purchase_return');
    expect(afterReturn.fabrics[0].quantityMeters).toBe(15);
    expect(afterReturn.fabrics[0].purchasePrice).toBe(13.3333);
    expect(returned).toMatchObject({ quantity: 5, unitCost: 20, totalCost: 100, sourceMovementId: original?.id, actorId: 'warehouse-user' });
    await expect(window.electronAPI.returnPurchase?.({
      itemType: 'fabric',
      itemId: 'FAB-WAC',
      quantity: 99,
      reason: 'إرجاع أكبر من الرصيد',
      originalMovementId: original?.id,
      purchaseId: 'PUR-WAC-2-RETURN-INVALID',
      actorId: 'warehouse-user',
    })).rejects.toThrow();
    expect((await window.electronAPI.getData()).fabrics[0].quantityMeters).toBe(15);
  });

  it('returns cancelled order material at usage snapshot cost without changing current WAC', async () => {
    const order = await window.electronAPI.createOrder({
      id: 'ORD-WAC-CANCEL', customerId: 'CUST-WAC', customerName: 'عميل WAC', fabricId: 'FAB-WAC', fabricName: 'قماش WAC',
      garmentCount: 1, totalAmount: 100, paidAmount: 0, orderDate: '2026-08-20', measurements: { ...DEFAULT_MEASUREMENTS }, styleDetails: { ...DEFAULT_STYLE_DETAILS }
    });
    await window.electronAPI.createPurchase({
      id: 'PUR-WAC-AFTER-ORDER', supplier: 'مورد لاحق', purchaseDate: '2026-08-20', paymentMethod: 'cash',
      lines: [{ itemType: 'fabric', itemId: 'FAB-WAC', itemName: 'قماش WAC', quantity: 10, unit: 'متر', unitPrice: 30 }]
    });
    const beforeCancel = await window.electronAPI.getData();
    const wacBeforeCancel = beforeCancel.fabrics[0].purchasePrice;
    const usageCost = beforeCancel.orderMaterialUsages.find((usage) => usage.orderId === order.id)?.unitCostAtUsage;
    await window.electronAPI.updateOrderStatus({ orderId: order.id, status: 'cancelled' });
    const afterCancel = await window.electronAPI.getData();
    const returnMovement = afterCancel.stockMovements.find((movement) => movement.referenceType === 'order_cancel' && movement.referenceId === order.id);
    expect(afterCancel.fabrics[0].purchasePrice).toBe(wacBeforeCancel);
    expect(returnMovement?.unitCost).toBe(usageCost);
    expect(afterCancel.fabrics[0].quantityMeters).toBe(20);
  });

  it('supports adjustment_in/out with explicit cost and permits reaching zero', async () => {
    await window.electronAPI.adjustStock!({
      itemType: 'fabric',
      itemId: 'FAB-WAC',
      quantity: 1,
      reason: 'إدخال جرد',
      direction: 'adjustment_in',
      actorId: 'warehouse-user',
      unitCost: 5,
    });
    let data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(11);
    expect(data.fabrics[0].purchasePrice).toBe(9.5455);
    await window.electronAPI.adjustStock!({
      itemType: 'fabric',
      itemId: 'FAB-WAC',
      quantity: 1,
      reason: 'إخراج جرد',
      direction: 'adjustment_out',
      actorId: 'warehouse-user',
    });
    await window.electronAPI.adjustStock!({
      itemType: 'fabric',
      itemId: 'FAB-WAC',
      quantity: 10,
      reason: 'تصفير المخزون',
      direction: 'adjustment_out',
      actorId: 'warehouse-user',
    });
    data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(0);
    expect(data.fabrics[0].purchasePrice).toBe(9.5455);
    await expect(window.electronAPI.adjustStock!({
      itemType: 'fabric',
      itemId: 'FAB-WAC',
      quantity: -1,
      reason: 'كمية سالبة',
      direction: 'adjustment_out',
      actorId: 'warehouse-user',
    })).rejects.toThrow();
  });

  it('rejects missing reason and unknown manual Cash source while preserving documented withdrawal', async () => {
    const createCashAdjustment = window.electronAPI.createCashAdjustment!;
    await expect(createCashAdjustment({ direction: 'in', sourceType: 'purchase' as any, amount: 10, paymentMethod: 'cash', transactionDate: '2026-08-20', description: 'مرفوض' })).rejects.toThrow();
    await expect(createCashAdjustment({ direction: 'in', sourceType: 'adjustment', amount: 10, paymentMethod: 'cash', transactionDate: '2026-08-20', description: '' })).rejects.toThrow();
    await createCashAdjustment({ direction: 'out', sourceType: 'withdrawal', amount: 50, paymentMethod: 'cash', transactionDate: '2026-08-20', description: 'سحب موثق', actorId: 'cashier-1', reason: 'احتياج تشغيلي' });
    const data = await window.electronAPI.getData();
    expect(data.cashTransactions[0]).toMatchObject({ sourceType: 'withdrawal', actorId: 'cashier-1', reason: 'احتياج تشغيلي' });
  });
});
