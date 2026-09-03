// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { initElectronMock, db, DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS } from '../services/electronMock';
import { AppData, Order, FabricItem } from '../types';

describe('db.transaction - Atomic Operations & Rollback Tests', () => {
  let sampleFabric: FabricItem;

  beforeEach(() => {
    // Clear localStorage before each test run
    localStorage.clear();
    // Re-initialize mock window.electronAPI
    initElectronMock();

    sampleFabric = {
      id: 'FAB-TEST-001',
      name: 'قماش ياباني أبيض فاخر',
      color: 'أبيض',
      colorHex: '#FFFFFF',
      purchasePrice: 40,
      sellingPrice: 60,
      quantityMeters: 50,
      minStockMeters: 10
    };

    // Seed initial test AppData into localStorage
    const initialData: AppData = {
      customers: [
        {
          id: 'CUST-001',
          name: 'أحمد علي',
          phone: '0501234567',
          createdAt: '2026-01-01',
          measurements: { ...DEFAULT_MEASUREMENTS },
          styleDetails: { ...DEFAULT_STYLE_DETAILS },
          measurementHistory: []
        }
      ],
      orders: [],
      invoices: [],
      fabrics: [sampleFabric],
      accessories: [],
      thobeTypes: [],
      colors: [],
      notifications: []
    };

    localStorage.setItem('sahwa_tailoring_app_data_v1', JSON.stringify(initialData));
  });

  it('1. Successfully creates an order and deducts fabric stock atomically', async () => {
    const orderData: Partial<Order> = {
      customerId: 'CUST-001',
      customerName: 'أحمد علي',
      customerPhone: '0501234567',
      fabricId: 'FAB-TEST-001',
      fabricName: 'قماش ياباني أبيض فاخر',
      garmentCount: 2, // 2 garments * 3.5m = 7 meters
      totalAmount: 300,
      paidAmount: 100,
      orderDate: '2026-08-01'
    };

    const newOrder = await window.electronAPI.createOrder(orderData);
    expect(newOrder).toBeDefined();
    expect(newOrder.fabricConsumptionMeters).toBe(7);

    // Verify stored data
    const updatedData = await window.electronAPI.getData();
    expect(updatedData.orders.length).toBe(1);
    expect(updatedData.invoices.length).toBe(1);

    // Verify fabric stock deducted atomically (50m - 7m = 43m)
    const fab = updatedData.fabrics.find((f) => f.id === 'FAB-TEST-001');
    expect(fab?.quantityMeters).toBe(43);
  });

  it('2. Updates an order atomically when switching fabric and garment count', async () => {
    const order = await window.electronAPI.createOrder({
      id: 'ORD-UPDATE-001', customerId: 'CUST-001', customerName: 'أحمد علي',
      fabricId: 'FAB-TEST-001', fabricName: 'قماش ياباني أبيض فاخر', garmentCount: 1, totalAmount: 300, paidAmount: 100
    });
    await db.transaction((draft) => {
      draft.fabrics.push({
        id: 'FAB-TEST-002', name: 'قماش كحلي للاختبار', color: 'كحلي', colorHex: '#111827',
        purchasePrice: 55, sellingPrice: 80, quantityMeters: 20, minStockMeters: 2
      });
    });

    await window.electronAPI.updateOrder({
      ...order, fabricId: 'FAB-TEST-002', fabricName: 'قماش كحلي للاختبار', fabricColor: 'كحلي', garmentCount: 2
    });
    const updated = await window.electronAPI.getData();
    expect(updated.fabrics.find((fabric) => fabric.id === 'FAB-TEST-001')?.quantityMeters).toBe(50);
    expect(updated.fabrics.find((fabric) => fabric.id === 'FAB-TEST-002')?.quantityMeters).toBe(13);
    expect(updated.orders[0].fabricId).toBe('FAB-TEST-002');
    expect(updated.orders[0].fabricConsumptionMeters).toBe(7);
    expect(updated.invoices[0].remainingAmount).toBe(200);
  });

  it('3. Rolls back updateOrder completely if the replacement fabric quantity is insufficient', async () => {
    const order = await window.electronAPI.createOrder({
      id: 'ORD-UPDATE-ROLLBACK', customerId: 'CUST-001', customerName: 'أحمد علي',
      fabricId: 'FAB-TEST-001', fabricName: 'قماش ياباني أبيض فاخر', garmentCount: 1, totalAmount: 300, paidAmount: 100
    });
    await expect(window.electronAPI.updateOrder({
      ...order,
      garmentCount: 20
    })).rejects.toThrow(/غير كافية/);

    const currentData = await window.electronAPI.getData();
    expect(currentData.orders[0].garmentCount).toBe(1);
    expect(currentData.orders[0].fabricConsumptionMeters).toBe(3.5);
    expect(currentData.fabrics.find((fabric) => fabric.id === 'FAB-TEST-001')?.quantityMeters).toBe(46.5);
  });

  it('4. Rolls back transaction completely if fabric stock is insufficient', async () => {
    // Attempting to order 20 garments * 3.5m = 70m (only 50m available in inventory)
    const excessOrderData: Partial<Order> = {
      customerId: 'CUST-001',
      customerName: 'أحمد علي',
      customerPhone: '0501234567',
      fabricId: 'FAB-TEST-001',
      fabricName: 'قماش ياباني أبيض فاخر',
      garmentCount: 20, // Requires 70 meters
      totalAmount: 3000,
      paidAmount: 500
    };

    // Expect error due to insufficient stock
    await expect(window.electronAPI.createOrder(excessOrderData)).rejects.toThrow(
      /غير كافية/
    );

    // Verify atomic rollback: fabric stock untouched, no order or invoice saved
    const currentData = await window.electronAPI.getData();
    expect(currentData.orders.length).toBe(0);
    expect(currentData.invoices.length).toBe(0);

    const fab = currentData.fabrics.find((f) => f.id === 'FAB-TEST-001');
    expect(fab?.quantityMeters).toBe(50); // Unchanged 50m
  });

  it('5. Does not change fabric stock when updating a cancelled order', async () => {
    const order = await window.electronAPI.createOrder({
      id: 'ORD-CANCELLED-UPDATE', customerId: 'CUST-001', customerName: 'أحمد علي',
      fabricId: 'FAB-TEST-001', fabricName: 'قماش ياباني أبيض فاخر', garmentCount: 1, totalAmount: 300, paidAmount: 100
    });
    await window.electronAPI.updateOrderStatus({ orderId: order.id, status: 'cancelled' });
    const beforeUpdate = await window.electronAPI.getData();
    expect(beforeUpdate.fabrics.find((fabric) => fabric.id === 'FAB-TEST-001')?.quantityMeters).toBe(50);

    await window.electronAPI.updateOrder({
      ...order,
      garmentCount: 2
    });
    const afterUpdate = await window.electronAPI.getData();
    expect(afterUpdate.fabrics.find((fabric) => fabric.id === 'FAB-TEST-001')?.quantityMeters).toBe(50);
    expect(afterUpdate.orders[0].fabricConsumptionMeters).toBe(7);
  });

  it('6. Rolls back completely if an unexpected error occurs during custom transaction callback', async () => {
    await expect(
      db.transaction((draft) => {
        // Mutate draft state mid-way
        const fab = draft.fabrics.find((f) => f.id === 'FAB-TEST-001');
        if (fab) {
          fab.quantityMeters = 0; // Partial mutation
        }
        draft.orders.push({ id: 'ORD-TEMP' } as any);

        // Throw error mid-transaction
        throw new Error('خطأ غير متوقع في قاعدة البيانات');
      })
    ).rejects.toThrow('خطأ غير متوقع في قاعدة البيانات');

    // Verify that partial mutations were NOT committed to storage
    const storedData = await window.electronAPI.getData();
    expect(storedData.orders.length).toBe(0);
    const fab = storedData.fabrics.find((f) => f.id === 'FAB-TEST-001');
    expect(fab?.quantityMeters).toBe(50);
  });

  it('5. Rejects deleting an active order with an invoice without changing stock or financial history', async () => {
    // First, create an order deducting 7 meters (leaving 43m)
    const order = await window.electronAPI.createOrder({
      customerId: 'CUST-001',
      customerName: 'أحمد علي',
      fabricId: 'FAB-TEST-001',
      garmentCount: 2,
      totalAmount: 300
    });

    let data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(43);
    expect(data.orders.length).toBe(1);

    await expect(window.electronAPI.deleteOrder(order.id)).rejects.toThrow(/لا يمكن حذف طلب له فاتورة/);

    data = await window.electronAPI.getData();
    expect(data.orders.length).toBe(1);
    expect(data.invoices.length).toBe(1);
    expect(data.fabrics[0].quantityMeters).toBe(43);
  });

  it('6. Cancelling an order restores fabric stock, and deleting a cancelled order is rejected without reversal', async () => {
    // 1. Create order (deducts 7m -> stock 43m)
    const order = await window.electronAPI.createOrder({
      customerId: 'CUST-001',
      customerName: 'أحمد علي',
      fabricId: 'FAB-TEST-001',
      garmentCount: 2,
      totalAmount: 300
    });

    // 2. Change status to 'cancelled' (should restore 7m -> stock 50m)
    await window.electronAPI.updateOrderStatus({ orderId: order.id, status: 'cancelled' });
    let data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(50);
    expect(data.orders[0].status).toBe('cancelled');

    // 3. Deleting a cancelled order with an invoice is rejected; no reversal is created.
    await expect(window.electronAPI.deleteOrder(order.id)).rejects.toThrow(/لا يمكن حذف طلب له فاتورة/);
    data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(50);
    expect(data.orders).toHaveLength(1);
    expect(data.invoices).toHaveLength(1);
    expect(data.cashTransactions.filter((transaction) => transaction.sourceType === 'adjustment')).toHaveLength(0);
  });

  it('7. Triggers stock alert notification automatically when stock falls below minStockMeters', async () => {
    // Stock is 50m, minStockMeters is 10m.
    // Order 12 garments * 3.5m = 42 meters => Stock becomes 8 meters (<= 10m minStock)
    const { alertMessages } = await db.transaction(async (draft) => {
      const fab = draft.fabrics.find(f => f.id === 'FAB-TEST-001');
      if (fab) {
        fab.quantityMeters = 8;
      }
      const newOrder = {
        id: 'ORD-TEST-001',
        orderNumber: '1002',
        customerId: 'CUST-001',
        customerName: 'أحمد علي',
        customerPhone: '0501234567',
        thobeTypeId: 'THOBE-1',
        thobeTypeName: 'ثوب سعودي',
        fabricId: 'FAB-TEST-001',
        fabricName: 'قماش ياباني أبيض فاخر',
        fabricColor: 'أبيض',
        fabricConsumptionMeters: 42,
        fabricBuyPriceAtOrder: 25,
        garmentCount: 12,
        orderDate: '2026-06-01',
        deliveryDate: '2026-06-10',
        status: 'new' as const,
        totalAmount: 1800,
        paidAmount: 0,
        remainingAmount: 1800,
        isCustomMeasurement: false,
        measurements: { ...DEFAULT_MEASUREMENTS },
        styleDetails: { ...DEFAULT_STYLE_DETAILS },
        notes: '',
        createdAt: new Date().toISOString()
      };
      draft.orders = [newOrder, ...draft.orders];
    });

    const data = await window.electronAPI.getData();
    expect(data.fabrics[0].quantityMeters).toBe(8); // Below minStock 10
    expect(data.notifications.length).toBeGreaterThan(0);
    expect(data.notifications[0].type).toBe('stock');
    expect(data.notifications[0].message).toContain('قماش ياباني أبيض فاخر');
    expect(alertMessages.length).toBeGreaterThan(0);
  });

  it('7. Persists pocket, jabzour, neck and new measurement fields for customers and orders', async () => {
    const selectedStyleDetails = {
      ...DEFAULT_STYLE_DETAILS,
      neckType: 'قلاب',
      neckShape: 'فرنسي',
      neckPadding: 'بلاستيك حديد',
      chestPocketStyle: 'جيب مربع',
      chestPocketWidth: '13',
      chestPocketDrop: '7',
      bottomHemShape: 'جبزور مثلث',
      habroorLength: '12'
    };
    const selectedMeasurements = {
      ...DEFAULT_MEASUREMENTS,
      neckHeight: '4.5'
    };

    await window.electronAPI.createCustomer({
      id: 'CUST-NEW-FIELDS',
      name: 'عميل الاختبار',
      phone: '0555555555',
      measurements: selectedMeasurements,
      styleDetails: selectedStyleDetails
    });

    let data = await window.electronAPI.getData();
    const customer = data.customers.find((item) => item.id === 'CUST-NEW-FIELDS');
    expect(customer?.measurements.neckHeight).toBe('4.5');
    expect(customer?.styleDetails.neckType).toBe('قلاب');
    expect(customer?.styleDetails.neckShape).toBe('فرنسي');
    expect(customer?.styleDetails.chestPocketStyle).toBe('جيب مربع');
    expect(customer?.styleDetails.chestPocketWidth).toBe('13');
    expect(customer?.styleDetails.chestPocketDrop).toBe('7');
    expect(customer?.styleDetails.bottomHemShape).toBe('جبزور مثلث');
    expect(customer?.styleDetails.habroorLength).toBe('12');

    await window.electronAPI.createOrder({
      id: 'ORD-NEW-FIELDS',
      customerId: 'CUST-NEW-FIELDS',
      customerName: 'عميل الاختبار',
      customerPhone: '0555555555',
      garmentCount: 1,
      totalAmount: 250,
      paidAmount: 0,
      measurements: selectedMeasurements,
      styleDetails: selectedStyleDetails
    });

    data = await window.electronAPI.getData();
    const order = data.orders.find((item) => item.id === 'ORD-NEW-FIELDS');
    expect(order?.measurements.neckHeight).toBe('4.5');
    expect(order?.styleDetails.neckType).toBe('قلاب');
    expect(order?.styleDetails.neckShape).toBe('فرنسي');
    expect(order?.styleDetails.chestPocketStyle).toBe('جيب مربع');
    expect(order?.styleDetails.chestPocketWidth).toBe('13');
    expect(order?.styleDetails.chestPocketDrop).toBe('7');
    expect(order?.styleDetails.bottomHemShape).toBe('جبزور مثلث');
    expect(order?.styleDetails.habroorLength).toBe('12');
  });

  it('keeps the order measurement snapshot independent from later customer edits', async () => {
    const customerMeasurements = { ...DEFAULT_MEASUREMENTS, neckHeight: '4' };
    const orderMeasurements = { ...DEFAULT_MEASUREMENTS, neckHeight: '5.5' };
    const customerStyle = { ...DEFAULT_STYLE_DETAILS, neckShape: 'مدور' };
    const orderStyle = { ...DEFAULT_STYLE_DETAILS, neckShape: 'فرنسي' };

    await window.electronAPI.createCustomer({
      id: 'CUST-SNAPSHOT', name: 'عميل النسخة', phone: '0555555555',
      measurements: customerMeasurements, styleDetails: customerStyle
    });
    await window.electronAPI.createOrder({
      id: 'ORD-SNAPSHOT', customerId: 'CUST-SNAPSHOT', customerName: 'عميل النسخة', customerPhone: '0555555555',
      garmentCount: 1, totalAmount: 250, paidAmount: 0, measurements: orderMeasurements, styleDetails: orderStyle
    });

    await window.electronAPI.updateCustomer({
      id: 'CUST-SNAPSHOT', name: 'عميل النسخة', phone: '0555555555', createdAt: '2026-08-13',
      measurements: { ...DEFAULT_MEASUREMENTS, neckHeight: '7' },
      styleDetails: { ...DEFAULT_STYLE_DETAILS, neckShape: 'مربع' }, measurementHistory: []
    });

    const data = await window.electronAPI.getData();
    const order = data.orders.find((item) => item.id === 'ORD-SNAPSHOT');
    const customer = data.customers.find((item) => item.id === 'CUST-SNAPSHOT');
    expect(order?.measurements.neckHeight).toBe('5.5');
    expect(order?.styleDetails.neckShape).toBe('فرنسي');
    expect(customer?.measurements.neckHeight).toBe('7');
    expect(customer?.styleDetails.neckShape).toBe('مربع');
  });

  it('creates a new measurement history record without overwriting the previous snapshot', async () => {
    await window.electronAPI.createCustomer({
      id: 'CUST-HISTORY',
      name: 'عميل سجل المقاسات',
      phone: '0555555556',
      measurements: { ...DEFAULT_MEASUREMENTS, neckHeight: '4' },
      styleDetails: { ...DEFAULT_STYLE_DETAILS, neckShape: 'مدور' }
    });

    const first = await window.electronAPI.getData();
    const current = first.customers.find((item) => item.id === 'CUST-HISTORY');
    expect(current?.measurementHistory).toHaveLength(0);

    await window.electronAPI.updateCustomer({
      ...current!,
      measurements: { ...current!.measurements, neckHeight: '5.5' },
      styleDetails: { ...current!.styleDetails, neckShape: 'فرنسي' }
    });

    const afterUpdate = await window.electronAPI.getData();
    const updated = afterUpdate.customers.find((item) => item.id === 'CUST-HISTORY');
    expect(updated?.measurements.neckHeight).toBe('5.5');
    expect(updated?.styleDetails.neckShape).toBe('فرنسي');
    expect(updated?.measurementHistory).toHaveLength(1);
    expect(updated?.measurementHistory[0].measurements.neckHeight).toBe('4');
    expect(updated?.measurementHistory[0].styleDetails.neckShape).toBe('مدور');

    await window.electronAPI.updateCustomer({ ...updated! });
    const afterSameUpdate = await window.electronAPI.getData();
    expect(afterSameUpdate.customers.find((item) => item.id === 'CUST-HISTORY')?.measurementHistory).toHaveLength(1);
  });

  it('8. Backfills missing measurement fields without changing legacy values', async () => {
    localStorage.setItem('sahwa_tailoring_app_data_v1', JSON.stringify({
      customers: [{
        id: 'LEGACY-CUSTOMER',
        name: 'عميل قديم',
        phone: '0500000000',
        measurements: { frontLength: '150' },
        styleDetails: { buttonsType: 'سادة' },
        measurementHistory: [{
          id: 'LEGACY-HISTORY',
          savedAt: '2025-01-01',
          measurements: { frontLength: '151' },
          styleDetails: {}
        }]
      }],
      orders: [{
        id: 'LEGACY-ORDER',
        measurements: { shoulderWidth: '44' },
        styleDetails: {}
      }],
      invoices: [],
      fabrics: [],
      accessories: [],
      thobeTypes: [],
      colors: [],
      notifications: []
    }));

    const data = await window.electronAPI.getData();
    expect(data.customers[0].measurements.frontLength).toBe('150');
    expect(data.customers[0].measurements.shoulderWidth).toBe('');
    expect(data.customers[0].styleDetails.buttonsType).toBe('سادة');
    expect(data.customers[0].styleDetails.chestPocketDrop).toBe('');
    expect(data.customers[0].measurementHistory[0].measurements.frontLength).toBe('151');
    expect(data.orders[0].measurements.shoulderWidth).toBe('44');
    expect(data.orders[0].styleDetails.chestPocketDrop).toBe('');
  });
});
