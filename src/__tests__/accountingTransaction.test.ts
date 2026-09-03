// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { db, DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, initElectronMock } from '../services/electronMock';
import { AppData } from '../types';

describe('inventory and accounting atomic flows', () => {
  beforeEach(() => {
    localStorage.clear();
    initElectronMock();
    const initialData: AppData = {
      customers: [],
      orders: [],
      invoices: [],
      fabrics: [{ id: 'FAB-A', name: 'قماش اختبار', color: 'أبيض', purchasePrice: 40, sellingPrice: 100, quantityMeters: 10, minStockMeters: 2 }],
      accessories: [{ id: 'ACC-A', name: 'سحاب اختبار', category: 'سحابات', quantity: 10, minStock: 2, unit: 'حبة', purchasePrice: 2 }],
      thobeTypes: [],
      colors: [],
      notifications: [],
      stockMovements: [],
      purchases: [],
      expenses: [],
      cashTransactions: [],
      orderMaterialUsages: []
    };
    localStorage.setItem('sahwa_tailoring_app_data_v1', JSON.stringify(initialData));
    initElectronMock();
  });

  it('records an approved purchase across stock, movement and cash exactly once', async () => {
    const payload = {
      id: 'PUR-TEST-1', supplier: 'مورد الاختبار', invoiceNumber: 'INV-1', purchaseDate: '2026-08-13', paymentMethod: 'cash' as const,
      lines: [{ itemType: 'fabric' as const, itemId: 'FAB-A', itemName: 'قماش اختبار', quantity: 5, unit: 'متر', unitPrice: 45 }]
    };
    await window.electronAPI.createPurchase(payload);
    await window.electronAPI.createPurchase(payload);
    const data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(15);
    expect(data.purchases).toHaveLength(1);
    expect(data.stockMovements.filter((movement) => movement.referenceId === 'PUR-TEST-1')).toHaveLength(1);
    expect(data.cashTransactions.filter((transaction) => transaction.sourceId === 'PUR-TEST-1')).toHaveLength(1);
    expect(data.cashTransactions[0].amount).toBe(225);
  });

  it('records an expense as one cash outflow and rejects invalid amounts', async () => {
    await window.electronAPI.createExpense({ id: 'EXP-TEST-1', category: 'تشغيل', amount: 120, expenseDate: '2026-08-13', paymentMethod: 'cash', description: 'مصروف اختبار' });
    await window.electronAPI.createExpense({ id: 'EXP-TEST-1', category: 'تشغيل', amount: 120, expenseDate: '2026-08-13', paymentMethod: 'cash', description: 'مصروف اختبار' });
    await expect(window.electronAPI.createExpense({ category: 'نقل', amount: 0, expenseDate: '2026-08-13', paymentMethod: 'cash', description: 'غير صالح' })).rejects.toThrow();
    const data = await window.electronAPI.getData();
    expect(data.expenses).toHaveLength(1);
    expect(data.cashTransactions.filter((transaction) => transaction.sourceId === 'EXP-TEST-1')).toHaveLength(1);
    expect(data.cashTransactions[0].direction).toBe('out');
  });

  it('snapshots material cost, consumes accessory stock and makes payment idempotent', async () => {
    const order = await window.electronAPI.createOrder({
      id: 'ORD-TEST-ACCOUNTING', customerId: 'CUST-ACCOUNTING', customerName: 'عميل اختبار', fabricId: 'FAB-A', fabricName: 'قماش اختبار', garmentCount: 1,
      totalAmount: 300, paidAmount: 100, orderDate: '2026-08-13', measurements: { ...DEFAULT_MEASUREMENTS }, styleDetails: { ...DEFAULT_STYLE_DETAILS },
      materialUsages: [{ itemType: 'accessory', itemId: 'ACC-A', itemName: 'سحاب اختبار', quantity: 2, unit: 'حبة', unitCostAtUsage: 2 }]
    });
    expect(order.materialCost).toBe(144);
    const created = await window.electronAPI.getData();
    expect(created.fabrics[0].quantityMeters).toBe(6.5);
    expect(created.accessories[0].quantity).toBe(8);
    expect(created.orderMaterialUsages).toHaveLength(2);
    expect(created.cashTransactions.filter((transaction) => transaction.sourceType === 'customer_payment')).toHaveLength(1);

    await window.electronAPI.addPayment({
      invoiceId: order.id ? `INV-${order.orderNumber}` : '',
      amount: 50,
      method: 'cash',
      note: 'دفعة اختبار',
      paymentId: 'PAY-IDEMPOTENT',
    });
    await window.electronAPI.addPayment({
      invoiceId: `INV-${order.orderNumber}`,
      amount: 50,
      method: 'cash',
      note: 'دفعة اختبار',
      paymentId: 'PAY-IDEMPOTENT',
    });
    const afterPayment = await window.electronAPI.getData();
    expect(afterPayment.invoices[0].paidAmount).toBe(150);
    expect(afterPayment.cashTransactions.filter((transaction) => transaction.sourceId === 'PAY-IDEMPOTENT')).toHaveLength(1);
  });

  it('treats repeated order creation with the same business identity as idempotent', async () => {
    const payload = {
      id: 'ORD-IDEMPOTENT', orderNumber: 'ORD-NUM-IDEMPOTENT', customerName: 'عميل تكرار', fabricId: 'FAB-A', fabricName: 'قماش اختبار', garmentCount: 1,
      totalAmount: 300, paidAmount: 100, orderDate: '2026-08-13', measurements: { ...DEFAULT_MEASUREMENTS }, styleDetails: { ...DEFAULT_STYLE_DETAILS }
    };
    await window.electronAPI.createOrder(payload);
    await window.electronAPI.createOrder(payload);

    const data = await window.electronAPI.getData();
    expect(data.orders.filter((order) => order.id === 'ORD-IDEMPOTENT')).toHaveLength(1);
    expect(data.invoices.filter((invoice) => invoice.orderId === 'ORD-IDEMPOTENT')).toHaveLength(1);
    expect(data.fabrics[0].quantityMeters).toBe(6.5);
    expect(data.stockMovements.filter((movement) => movement.referenceId === 'ORD-IDEMPOTENT')).toHaveLength(1);
    expect(data.orderEvents?.filter((event) => event.orderId === 'ORD-IDEMPOTENT' && event.type === 'created')).toHaveLength(1);
    expect(data.cashTransactions.filter((transaction) => transaction.orderId === 'ORD-IDEMPOTENT')).toHaveLength(1);
    expect(data.cashTransactions.find((transaction) => transaction.orderId === 'ORD-IDEMPOTENT')?.referenceNumber).toBe('ORD-NUM-IDEMPOTENT');
  });

  it('prevents negative stock and records manual adjustments with before/after balances', async () => {
    await expect(window.electronAPI.adjustStock({
      itemType: 'fabric',
      itemId: 'FAB-A',
      quantity: -11,
      reason: 'جرد ناقص',
      direction: 'adjustment',
    })).rejects.toThrow();
    await window.electronAPI.adjustStock({
      itemType: 'fabric',
      itemId: 'FAB-A',
      quantity: -1,
      reason: 'جرد فعلي',
      direction: 'adjustment',
    });
    const data = await window.electronAPI.getData();
    const movement = data.stockMovements.find((entry) => entry.reason === 'جرد فعلي');
    expect(movement?.quantityBefore).toBe(10);
    expect(movement?.quantityAfter).toBe(9);
  });

  it('keeps expense notes and manual cash references available for financial reconciliation', async () => {
    await window.electronAPI.createExpense({
      id: 'EXP-NOTES-1', category: 'تشغيل', amount: 250, expenseDate: '2026-08-13', paymentMethod: 'transfer', description: 'مصروف إيجار', notes: 'دفعة شهرية'
    });
    await window.electronAPI.createCashAdjustment({
      direction: 'out', sourceType: 'withdrawal', amount: 50, transactionDate: '2026-08-13', paymentMethod: 'cash', referenceNumber: 'REF-CASH-01', description: 'سحب اختبار'
    });

    const data = await window.electronAPI.getData();
    expect(data.expenses[0].notes).toBe('دفعة شهرية');
    expect(data.cashTransactions.find((transaction) => transaction.sourceId === 'EXP-NOTES-1')?.notes).toBe('دفعة شهرية');
    expect(data.cashTransactions.find((transaction) => transaction.referenceNumber === 'REF-CASH-01')?.description).toBe('سحب اختبار');
  });

  it('restores a valid exported backup and reports success', async () => {
    const backup = await window.electronAPI.exportBackup();
    await window.electronAPI.clearAllData();
    expect((await window.electronAPI.getData()).fabrics).toHaveLength(0);

    const result = await window.electronAPI.importBackup(backup);
    const restored = await window.electronAPI.getData();
    expect(result.success).toBe(true);
    expect(restored.fabrics[0]?.id).toBe('FAB-A');
  });
});
