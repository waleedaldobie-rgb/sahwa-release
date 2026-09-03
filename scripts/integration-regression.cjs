const fs = require('fs');
const os = require('os');
const childProcess = require('child_process');
const path = require('path');
const assert = require('assert');
const { app, ipcMain } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');
const { CURRENT_SCHEMA_VERSION } = require('../dist-electron/schema.js');
const XLSX = require('xlsx');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-integration-'));
const databaseDir = path.join(root, 'database');
const backupDir = path.join(root, 'backups');
const results = [];

function record(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    results.push({ name, status: 'passed' });
  }).catch((error) => {
    results.push({ name, status: 'failed', error: error?.message || String(error) });
    throw error;
  });
}

function call(channel, ...args) {
  const registry = ipcMain._invokeHandlers || ipcMain._invokeHandlersMap;
  const entry = registry && registry.get(channel);
  const handler = typeof entry === 'function' ? entry : entry?.callback;
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`);
  return handler({ sender: null }, ...args);
}

async function main() {
  await app.whenReady();
  const manager = new SahwaDatabaseManager(databaseDir, undefined, backupDir);
  const init = manager.initDatabase();
  assert.equal(init.success, true, init.error || 'database initialization failed');
  registerIpcHandlers(manager);

  await record('real IPC bridge registry', async () => {
    for (const channel of ['customers:create', 'customers:update', 'orders:create', 'orders:update', 'orders:delete', 'invoices:addPayment', 'purchases:create', 'reports:exportExcel', 'system:backup', 'system:restore', 'system:clearAllData', 'system:integrityCheck']) {
      assert.ok((ipcMain._invokeHandlers || ipcMain._invokeHandlersMap).has(channel), channel);
    }
  });

  await record('fresh seed visible customer sequence allocates after seeded customers', async () => {
    const seededCustomers = await call('customers:list');
    assert.equal(seededCustomers.length, 2);
    assert.deepEqual(seededCustomers.map((customer) => customer.customerNumber).sort((a, b) => a - b), [1, 2]);
    assert.equal(manager.getRawDb().prepare("SELECT next_number FROM visible_number_sequences WHERE name = 'customers'").get().next_number, 3);

    const freshCustomer = await call('customers:create', {
      id: 'CUST-FRESH-SEQUENCE-001', name: 'عميل fresh sequence', phone: '0500000099',
      measurements: {}, styleDetails: {}
    });
    assert.equal(freshCustomer.customerNumber, 3);
    assert.equal(manager.getRawDb().prepare('SELECT customer_number FROM customers WHERE id = ?').get('CUST-FRESH-SEQUENCE-001').customer_number, 3);
    assert.equal(manager.getRawDb().prepare("SELECT next_number FROM visible_number_sequences WHERE name = 'customers'").get().next_number, 4);
  });

  await record('clear data integration path', async () => {
    const cleared = await call('system:clearAllData');
    assert.equal(cleared, true);
    const db = manager.getRawDb();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0);
    assert.equal(fs.readdirSync(backupDir).some((file) => file.includes('pre_clear')), true);
  });

  const customerId = 'CUST-INT-001';
  const fabricId = 'FAB-INT-001';
  const accessoryId = 'ACC-INT-001';
  const orderId = 'ORD-INT-001';
  const orderNumber = 'INT-1001';

  await record('create customer, save measurements, and measurement history', async () => {
    const customer = await call('customers:create', {
      id: customerId, name: 'عميل تكامل', phone: '0500000001',
      measurements: { frontLength: '150', neckSize: '42' }, styleDetails: { neckType: 'قلاب' }
    });
    assert.equal(customer.id, customerId);
    const updated = { ...customer, measurements: { ...customer.measurements, frontLength: '152', sleeveLength: '63' } };
    assert.equal(await call('customers:update', updated), true);
    const afterUpdate = (await call('customers:list')).find((item) => item.id === customerId);
    assert.equal(afterUpdate.measurements.frontLength, '152');
    assert.equal(afterUpdate.measurementHistory.length, 1);
    assert.equal(afterUpdate.measurementHistory[0].measurements.frontLength, '150');
    const history = await call('customers:saveMeasurementHistory', customerId, 'قياس التكامل');
    assert.equal(history.note, 'قياس التكامل');
    const afterHistory = (await call('customers:list')).find((item) => item.id === customerId);
    assert.equal(afterHistory.measurementHistory.length, 2);
  });

  await record('create fabric and accessory inventory', async () => {
    const fabric = await call('fabrics:create', {
      id: fabricId, name: 'قماش تكامل', color: 'أبيض', colorHex: '#fff', purchasePrice: 40,
      sellingPrice: 100, quantityMeters: 30, minStockMeters: 2
    });
    const accessory = await call('accessories:create', {
      id: accessoryId, name: 'سحاب تكامل', category: 'سحابات', quantity: 10, minStock: 2, unit: 'حبة', purchasePrice: 5, sellingPrice: 12
    });
    assert.equal(fabric.quantityMeters, 30);
    assert.equal(accessory.quantity, 10);
    await call('accessories:update', { ...accessory, sellingPrice: 12, quantity: 999 });
    const loadedInventory = (await call('data:get')).accessories.find((item) => item.id === accessoryId);
    assert.equal(loadedInventory.purchasePrice, 5);
    assert.equal(loadedInventory.sellingPrice, 12);
    assert.equal(loadedInventory.quantity, 10);
    await call('fabrics:update', { ...fabric, quantityMeters: 999, purchasePrice: 40, sellingPrice: 100 });
    const afterCatalogUpdate = (await call('fabrics:list')).find((item) => item.id === fabricId);
    assert.equal(afterCatalogUpdate.quantityMeters, 30);
  });

  const orderPayload = {
    id: orderId, orderNumber, customerId, customerName: 'عميل تكامل', customerPhone: '0500000001',
    thobeTypeId: 'THB-01', thobeTypeName: 'ثوب سعودي كلاسيك', fabricId, fabricName: 'قماش تكامل', fabricColor: 'أبيض',
    garmentCount: 1, totalAmount: 300, paidAmount: 100, initialPaymentMethod: 'cash',
    orderDate: '2026-08-16', deliveryDate: '2026-08-20', measurements: { frontLength: '152', sleeveLength: '63' },
    styleDetails: { neckType: 'قلاب' }, materialUsages: [{ itemType: 'accessory', itemId: accessoryId, itemName: 'سحاب تكامل', quantity: 2, unit: 'حبة', unitCostAtUsage: 5 }]
  };

  await record('create order, material usage, invoice, initial payment, and profit', async () => {
    const order = await call('orders:create', orderPayload);
    assert.equal(order.id, orderId);
    assert.equal(order.materialCost, 150);
    assert.equal(order.profit, 150);
    const db = manager.getRawDb();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE id = ?').get(orderId).count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM invoices WHERE order_id = ?').get(orderId).count, 1);
    assert.equal(db.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId).quantity_meters, 26.5);
    assert.equal(db.prepare('SELECT quantity FROM accessories WHERE id = ?').get(accessoryId).quantity, 8);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cash_transactions WHERE order_id = ?').get(orderId).count, 1);
  });

  await record('duplicate order save is idempotent', async () => {
    await call('orders:create', orderPayload);
    const db = manager.getRawDb();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE id = ?').get(orderId).count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_id = ?').get(orderId).count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cash_transactions WHERE order_id = ?').get(orderId).count, 1);
  });

  await record('payment and remaining amount update are idempotent', async () => {
    const invoice = (await call('invoices:list')).find((item) => item.orderId === orderId);
    assert.ok(invoice);
    assert.equal(await call('invoices:addPayment', { invoiceId: invoice.id, amount: 50, method: 'cash', note: 'دفعة تكامل', paymentId: 'PAY-INT-001' }), true);
    assert.equal(await call('invoices:addPayment', { invoiceId: invoice.id, amount: 50, method: 'cash', note: 'دفعة تكامل', paymentId: 'PAY-INT-001' }), false);
    const updatedInvoice = (await call('invoices:list')).find((item) => item.id === invoice.id);
    assert.equal(updatedInvoice.paidAmount, 150);
    assert.equal(updatedInvoice.remainingAmount, 150);
    assert.equal((await call('cash:list')).filter((item) => item.sourceId === 'PAY-INT-001').length, 1);
  });

  await record('paidAmount cannot bypass the payment ledger', async () => {
    const currentOrder = (await call('orders:list')).find((item) => item.id === orderId);
    assert.ok(currentOrder);
    await assert.rejects(
      call('orders:update', { ...currentOrder, paidAmount: 200 }),
      /مسار الدفعات|لا يمكن تعديل المبلغ المدفوع/
    );
    const invoice = (await call('invoices:list')).find((item) => item.orderId === orderId);
    assert.equal(invoice.paidAmount, 150);
    assert.equal(invoice.payments.reduce((sum, payment) => sum + payment.amount, 0), 150);
  });

  await record('backend rejects invalid order amounts and accepts overpayment as customer credit', async () => {
    await assert.rejects(
      call('orders:create', { ...orderPayload, id: 'ORD-NEGATIVE-GARMENT', orderNumber: 'INT-NEGATIVE-GARMENT', garmentCount: -1, paidAmount: 0 }),
      /عدد الثياب/
    );
    const overpaidOrder = await call('orders:create', {
      ...orderPayload,
      id: 'ORD-OVERPAYMENT',
      orderNumber: 'INT-OVERPAYMENT',
      garmentCount: 1,
      paidAmount: 301,
      cashReceived: 301
    });
    const overpaidInvoice = (await call('invoices:list')).find((item) => item.orderId === overpaidOrder.id);
    assert.equal(overpaidInvoice.paidAmount, 300);
    assert.equal(overpaidInvoice.remainingAmount, 0);
    assert.equal(overpaidInvoice.cashReceived, 301);
    assert.equal(overpaidInvoice.overpaymentAmount, 1);
    const overpaymentData = await call('data:get');
    assert.ok((overpaymentData.customerCredits || []).some((entry) => entry.invoiceId === overpaidInvoice.id && entry.entryType === 'created' && entry.amount === 1));
  });

  await record('backend validates order status before inventory movement', async () => {
    const db = manager.getRawDb();
    const beforeMovements = db.prepare('SELECT COUNT(*) AS count FROM inventory_movements').get().count;
    await assert.rejects(
      call('orders:create', { ...orderPayload, id: 'ORD-INVALID-STATUS', orderNumber: 'INT-INVALID-STATUS', status: 'unknown', paidAmount: 0 }),
      /حالة الطلب/
    );
    await assert.rejects(
      call('orders:create', { ...orderPayload, id: 'ORD-CANCELLED-CREATE', orderNumber: 'INT-CANCELLED-CREATE', status: 'cancelled', paidAmount: 0 }),
      /لا يمكن إنشاء/
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE id IN (?, ?)').get('ORD-INVALID-STATUS', 'ORD-CANCELLED-CREATE').count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory_movements').get().count, beforeMovements);
    const valid = await call('orders:create', { ...orderPayload, id: 'ORD-VALID-STATUS', orderNumber: 'INT-VALID-STATUS', status: 'processing', paidAmount: 0, fabricId: undefined, fabricName: 'بدون قماش', materialUsages: [], orderDate: '2026-09-01', deliveryDate: '2026-09-02' });
    assert.equal(valid.status, 'processing');
    await assert.rejects(call('orders:updateStatus', { orderId: 'ORD-VALID-STATUS', status: 'unknown' }), /حالة الطلب/);
    await call('orders:updateStatus', { orderId: 'ORD-VALID-STATUS', status: 'ready' });
    await call('orders:updateStatus', { orderId: 'ORD-VALID-STATUS', status: 'delivered' });
    await call('orders:updateStatus', { orderId: 'ORD-VALID-STATUS', status: 'ready' });
    const correctedStatus = db.prepare('SELECT status FROM orders WHERE id = ?').get('ORD-VALID-STATUS');
    assert.equal(correctedStatus.status, 'ready');
  });

  await record('backend validates payment methods across financial entry points', async () => {
    const db = manager.getRawDb();
    const beforeCash = db.prepare('SELECT COUNT(*) AS count FROM cash_transactions').get().count;
    await assert.rejects(
      call('invoices:addPayment', { invoiceId: `INV-${orderNumber}`, amount: 1, method: 'bitcoin', note: 'invalid method', paymentId: 'PAY-INVALID-METHOD' }),
      /طريقة الدفع/
    );
    await assert.rejects(
      call('purchases:create', { id: 'PUR-INVALID-METHOD', supplier: 'مورد', paymentMethod: 'bitcoin', lines: [{ itemType: 'fabric', itemId: fabricId, quantity: 1, unit: 'متر', unitPrice: 1 }] }),
      /طريقة الدفع/
    );
    await assert.rejects(
      call('expenses:create', { id: 'EXP-INVALID-METHOD', category: 'تشغيل', amount: 1, paymentMethod: '', description: 'invalid method' }),
      /طريقة الدفع/
    );
    await assert.rejects(
      call('cash:createAdjustment', { id: 'CASH-INVALID-METHOD', amount: 1, paymentMethod: 'bitcoin', description: 'invalid method' }),
      /طريقة الدفع/
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cash_transactions').get().count, beforeCash);
  });

  await record('payment ledger drift is rejected before a new payment', async () => {
    const db = manager.getRawDb();
    const invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(orderId);
    db.prepare('UPDATE invoices SET paid_amount = 200, remaining_amount = 100 WHERE id = ?').run(invoice.id);
    await assert.rejects(
      call('invoices:addPayment', { invoiceId: invoice.id, amount: 10, method: 'cash', note: 'يجب رفضها', paymentId: 'PAY-DRIFT-001' }),
      /لا تتطابق مع سجل الدفعات/
    );
    db.prepare('UPDATE invoices SET paid_amount = 150, remaining_amount = 150 WHERE id = ?').run(invoice.id);
  });

  const oldSnapshot = manager.exportFullDataAsJson();
  const oldAccessory = oldSnapshot.accessories.find((item) => item.id === accessoryId);
  assert.equal(oldAccessory.purchasePrice, 5);
  assert.equal(oldAccessory.sellingPrice, 12);
  const oldBackupJson = JSON.stringify(oldSnapshot);

  await record('purchase increases inventory and records cash outflow', async () => {
    const purchase = await call('purchases:create', {
      id: 'PUR-INT-001', supplier: 'مورد تكامل', invoiceNumber: 'P-INT-1', purchaseDate: '2026-08-16', paymentMethod: 'cash',
      lines: [
        { itemType: 'fabric', itemId: fabricId, itemName: 'قماش تكامل', quantity: 5, unit: 'متر', unitPrice: 42 },
        { itemType: 'accessory', itemId: accessoryId, itemName: 'سحاب تكامل', quantity: 4, unit: 'حبة', unitPrice: 6 }
      ]
    });
    assert.equal(purchase.totalAmount, 234);
    const db = manager.getRawDb();
    assert.equal(db.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId).quantity_meters, 28);
    assert.equal(db.prepare('SELECT quantity FROM accessories WHERE id = ?').get(accessoryId).quantity, 10);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cash_transactions WHERE source_id = ?').get('PUR-INT-001').count, 1);
  });

  await record('expense records one cash outflow', async () => {
    const expense = await call('expenses:create', { id: 'EXP-INT-001', category: 'تشغيل', amount: 80, expenseDate: '2026-08-16', paymentMethod: 'cash', description: 'مصروف تكامل' });
    assert.equal(expense.id, 'EXP-INT-001');
    const db = manager.getRawDb();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cash_transactions WHERE source_id = ?').get('EXP-INT-001').count, 1);
  });

  await record('reports and Excel export contain data', async () => {
    const report = await call('reports:exportExcel', '2026-08-01', '2026-08-31');
    assert.ok(typeof report === 'string' && report.length > 100);
    const workbook = XLSX.read(Buffer.from(report, 'base64'), { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, ['تقرير المبيعات', 'ملخص المحاسبة', 'Customer Credit', 'قيمة المخزون']);
    const customerCreditRows = XLSX.utils.sheet_to_json(workbook.Sheets['Customer Credit']);
    const customerCreditMetric = (row) => row.metric ?? row['البيان'];
    assert.ok(customerCreditRows.some((row) => customerCreditMetric(row) === 'customer_credit_cash_refunds'));
    assert.ok(customerCreditRows.some((row) => customerCreditMetric(row) === 'customer_credit_non_cash_refunds'));
    const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets['ملخص المحاسبة']);
    assert.ok(summaryRows.some((row) => row['البيان'] === 'إجمالي المشتريات' && row['القيمة'] === 234));
    assert.equal(summaryRows.find((row) => row['البيان'] === 'Overpayment created')['القيمة'], 1);
    const db = manager.getRawDb();
    const totals = db.prepare(`SELECT SUM(total_amount) AS sales, SUM(paid_amount) AS paid, SUM(remaining_amount) AS remaining FROM orders WHERE order_date BETWEEN ? AND ?`).get('2026-08-01', '2026-08-31');
    assert.equal(totals.sales, 600);
    assert.equal(totals.paid, 450);
    assert.equal(totals.remaining, 150);
    const earlyReport = await call('reports:exportExcel', '2026-08-01', '2026-08-16');
    const earlyWorkbook = XLSX.read(Buffer.from(earlyReport, 'base64'), { type: 'buffer' });
    const earlySummary = XLSX.utils.sheet_to_json(earlyWorkbook.Sheets['ملخص المحاسبة']);
    const earlyCollected = earlySummary.find((row) => row['البيان'] === 'Applied collected')['القيمة'];
    const earlyCashReceived = earlySummary.find((row) => row['البيان'] === 'Cash received')['القيمة'];
    assert.equal(earlyCollected, 400);
    assert.equal(earlyCashReceived, 401);
    assert.equal(earlySummary.find((row) => row['البيان'] === 'Overpayment created')['القيمة'], 0);
  });

  await record('card and transfer remain separate from the cash drawer', async () => {
    const beforeCashOut = (await call('cash:list')).filter((item) => item.direction === 'out' && item.paymentMethod === 'cash').reduce((sum, item) => sum + item.amount, 0);
    await call('purchases:create', {
      id: 'PUR-CARD-001', supplier: 'مورد بطاقة', invoiceNumber: 'P-CARD-1', purchaseDate: '2026-08-19', paymentMethod: 'card',
      lines: [{ itemType: 'fabric', itemId: fabricId, itemName: 'قماش تكامل', quantity: 1, unit: 'متر', unitPrice: 42 }]
    });
    await call('expenses:create', { id: 'EXP-TRANSFER-001', category: 'تشغيل', amount: 25, expenseDate: '2026-08-19', paymentMethod: 'transfer', description: 'مصروف تحويل' });
    const transactions = await call('cash:list');
    assert.equal(transactions.some((item) => item.sourceId === 'PUR-CARD-001' && item.paymentMethod === 'card'), true);
    assert.equal(transactions.some((item) => item.sourceId === 'EXP-TRANSFER-001' && item.paymentMethod === 'transfer'), true);
    const afterCashOut = transactions.filter((item) => item.direction === 'out' && item.paymentMethod === 'cash').reduce((sum, item) => sum + item.amount, 0);
    assert.equal(afterCashOut, beforeCashOut);
  });

  await record('backup, restore of older snapshot, and persistence after reopen', async () => {
    const backup = await call('system:backup');
    assert.ok(typeof backup === 'string' && backup.length > 100);
    const versionedBackup = JSON.parse(backup);
    assert.equal(versionedBackup.backupSchemaVersion, 2);
    assert.equal(versionedBackup.schemaVersion, CURRENT_SCHEMA_VERSION);
    const sqliteBackups = fs.readdirSync(backupDir).filter((fileName) => fileName.includes('manual_user') && fileName.endsWith('.db'));
    assert.ok(sqliteBackups.length > 0);
    const restoreResult = await call('system:restore', oldBackupJson);
    assert.equal(restoreResult.success, true, restoreResult.error || 'restore failed without an error');
    const db = manager.getRawDb();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM purchases WHERE id = ?').get('PUR-INT-001').count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM expenses WHERE id = ?').get('EXP-INT-001').count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE id = ?').get(orderId).count, 1);
    const restoredAccessory = (await call('accessories:list')).find((item) => item.id === accessoryId);
    assert.equal(restoredAccessory.purchasePrice, 5);
    assert.equal(restoredAccessory.sellingPrice, 12);
    const integrity = await call('system:integrityCheck');
    assert.equal(integrity.ok, true, JSON.stringify(integrity.issues));
    const legacyBackup = JSON.parse(oldBackupJson);
    delete legacyBackup.backupSchemaVersion;
    delete legacyBackup.schemaVersion;
    const legacyRestore = await call('system:restore', JSON.stringify(legacyBackup));
    assert.equal(legacyRestore.success, true, legacyRestore.error || 'legacy restore failed');
  });

  await record('integrity checker detects missing source movement in live database', async () => {
    const restore = await call('system:restore', oldBackupJson);
    assert.equal(restore.success, true, restore.error || 'setup restore failed');
    const db = manager.getRawDb();
    const usage = db.prepare('SELECT source_movement_id FROM order_material_usages WHERE source_movement_id IS NOT NULL LIMIT 1').get();
    assert.ok(usage?.source_movement_id);
    db.prepare('DELETE FROM inventory_movements WHERE id = ?').run(usage.source_movement_id);
    const report = await call('system:integrityCheck');
    assert.equal(report.ok, false);
    assert.equal(report.issues.some((issue) => issue.code === 'MISSING_SOURCE_MOVEMENT'), true);
    const cleanup = await call('system:restore', oldBackupJson);
    assert.equal(cleanup.success, true, cleanup.error || 'integrity fixture cleanup failed');
  });

  await record('restore rejects business-inconsistent backup without changing the database', async () => {
    const beforeOrderCount = manager.getRawDb().prepare('SELECT COUNT(*) AS count FROM orders').get().count;
    const invalid = JSON.parse(oldBackupJson);
    invalid.invoices[0].paidAmount = 999;
    invalid.invoices[0].remainingAmount = 0;
    const result = await call('system:restore', JSON.stringify(invalid));
    assert.equal(result.success, false);
    assert.match(result.error, /INVOICE_PAYMENT_MISMATCH|INVOICE_ORDER_AGGREGATE_MISMATCH/);
    assert.equal(manager.getRawDb().prepare('SELECT COUNT(*) AS count FROM orders').get().count, beforeOrderCount);
  });

  await record('restore rejects incomplete and untraceable business ledgers', async () => {
    const beforeOrderCount = manager.getRawDb().prepare('SELECT COUNT(*) AS count FROM orders').get().count;
    const missingCollection = JSON.parse(oldBackupJson);
    delete missingCollection.cashTransactions;
    const missingCollectionResult = await call('system:restore', JSON.stringify(missingCollection));
    assert.equal(missingCollectionResult.success, false);
    assert.match(missingCollectionResult.error, /MISSING_COLLECTION/);
    assert.equal(manager.getRawDb().prepare('SELECT COUNT(*) AS count FROM orders').get().count, beforeOrderCount);

    const missingMovement = JSON.parse(oldBackupJson);
    assert.ok(missingMovement.orderMaterialUsages.length > 0);
    missingMovement.orderMaterialUsages[0].sourceMovementId = 'MISSING-MOVEMENT-RESTORE';
    const missingMovementResult = await call('system:restore', JSON.stringify(missingMovement));
    assert.equal(missingMovementResult.success, false);
    assert.match(missingMovementResult.error, /MISSING_SOURCE_MOVEMENT/);
    assert.equal(manager.getRawDb().prepare('SELECT COUNT(*) AS count FROM orders').get().count, beforeOrderCount);

    const invalidMethod = JSON.parse(oldBackupJson);
    invalidMethod.expenses.push({ id: 'EXP-INVALID-RESTORE', category: 'تشغيل', amount: 1, expenseDate: '2026-08-19', paymentMethod: 'bitcoin', description: 'invalid', createdAt: new Date().toISOString() });
    const invalidMethodResult = await call('system:restore', JSON.stringify(invalidMethod));
    assert.equal(invalidMethodResult.success, false);
    assert.match(invalidMethodResult.error, /INVALID_PAYMENT_METHOD|MISSING_EXPENSE_CASH/);
    assert.equal(manager.getRawDb().prepare('SELECT COUNT(*) AS count FROM orders').get().count, beforeOrderCount);
  });

  await record('WhatsApp failure records failed state without success audit', async () => {
    process.env.SAHWA_FORCE_WHATSAPP_FAILURE = '1';
    try {
      assert.equal(await call('whatsapp:send', { phone: '0500000001', customerName: 'عميل تكامل', orderNumber, statusText: 'قيد التنفيذ' }), false);
    } finally {
      delete process.env.SAHWA_FORCE_WHATSAPP_FAILURE;
    }
    const snapshot = await call('data:get');
    assert.equal(snapshot.notifications.some((item) => item.orderId === orderId && item.title.includes('فشل فتح')), true);
    assert.equal(snapshot.notifications.some((item) => item.orderId === orderId && item.title.includes('تم فتح')), false);
    const events = await call('orders:events:list', orderId);
    assert.equal(events.some((item) => item.type === 'whatsapp' && item.title.includes('فشل')), true);
  });

  await record('order numbers use a persistent sequence instead of row count', async () => {
    const first = await call('orders:create', { ...orderPayload, id: 'ORD-SEQ-001', orderNumber: undefined, totalAmount: 50, paidAmount: 0, materialUsages: [] });
    const second = await call('orders:create', { ...orderPayload, id: 'ORD-SEQ-002', orderNumber: undefined, totalAmount: 50, paidAmount: 0, materialUsages: [] });
    assert.notEqual(first.orderNumber, second.orderNumber);
    assert.equal(Number(second.orderNumber), Number(first.orderNumber) + 1);
    await call('orders:updateStatus', { orderId: 'ORD-SEQ-001', status: 'cancelled' });
    const third = await call('orders:create', { ...orderPayload, id: 'ORD-SEQ-003', orderNumber: undefined, totalAmount: 50, paidAmount: 0, materialUsages: [] });
    assert.equal(Number(third.orderNumber), Number(second.orderNumber) + 1);
  });

  await record('cancel edit reactivate consumes the new material snapshot only', async () => {
    await call('fabrics:create', { id: 'FAB-INT-002', name: 'قماش بديل تكامل', color: 'كحلي', colorHex: '#111827', purchasePrice: 55, sellingPrice: 120, quantityMeters: 30, minStockMeters: 2 });
    const activeOrder = (await call('orders:list')).find((item) => item.id === orderId);
    assert.ok(activeOrder);
    const beforeCancelFabric = manager.getRawDb().prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId).quantity_meters;
    const beforeCancelAccessory = manager.getRawDb().prepare('SELECT quantity FROM accessories WHERE id = ?').get(accessoryId).quantity;
    await call('orders:updateStatus', { orderId, status: 'cancelled' });
    const afterCancel = manager.getRawDb();
    assert.equal(afterCancel.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId).quantity_meters, beforeCancelFabric + 3.5);
    assert.equal(afterCancel.prepare('SELECT quantity FROM accessories WHERE id = ?').get(accessoryId).quantity, beforeCancelAccessory + 2);
    assert.equal(await call('orders:update', { ...activeOrder, status: 'cancelled', fabricId: 'FAB-INT-002', fabricName: 'قماش بديل تكامل', fabricColor: 'كحلي', garmentCount: 2 }), true);
    assert.equal(afterCancel.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get('FAB-INT-002').quantity_meters, 30);
    const updatedMaterials = afterCancel.prepare('SELECT item_type, item_id, quantity, source_movement_id FROM order_material_usages WHERE order_id = ? ORDER BY item_type, item_id').all(orderId);
    assert.equal(updatedMaterials.some((row) => row.item_type === 'fabric' && row.item_id === 'FAB-INT-002' && row.quantity === 7 && row.source_movement_id === null), true);
    assert.equal(updatedMaterials.some((row) => row.item_type === 'fabric' && row.item_id === fabricId), false);
    await call('orders:updateStatus', { orderId, status: 'new' });
    assert.equal(afterCancel.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId).quantity_meters, beforeCancelFabric + 3.5);
    assert.equal(afterCancel.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get('FAB-INT-002').quantity_meters, 23);
    assert.equal(afterCancel.prepare('SELECT quantity FROM accessories WHERE id = ?').get(accessoryId).quantity, beforeCancelAccessory);
    assert.equal(afterCancel.prepare('SELECT COUNT(*) AS count FROM order_material_usages WHERE order_id = ? AND source_movement_id IS NULL').get(orderId).count, 0);
  });

  await record('delete order with financial ledger is rejected without cash reversal', async () => {
    const deleted = await call('orders:create', { ...orderPayload, id: 'ORD-DELETE-PAY', orderNumber: 'DELETE-PAY-1', totalAmount: 100, paidAmount: 20, materialUsages: [] });
    const beforeDelete = await call('cash:list');
    await assert.rejects(
      call('orders:delete', deleted.id),
      /سجل مالي|أرشفة|financial/
    );
    assert.deepEqual(await call('cash:list'), beforeDelete);
    assert.equal((await call('orders:list')).some((item) => item.id === deleted.id), true);
  });

  await record('manual stock adjustment rolls back when movement insert fails', async () => {
    const db = manager.getRawDb();
    const before = db.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId).quantity_meters;
    db.exec("CREATE TRIGGER integration_fail_inventory_insert BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT, 'forced movement failure'); END");
    await assert.rejects(call('stock:adjust', { itemType: 'fabric', itemId: fabricId, quantity: 2, reason: 'اختبار rollback', direction: 'adjustment' }), /حدث خطأ غير متوقع/);
    db.exec('DROP TRIGGER integration_fail_inventory_insert');
    assert.equal(db.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId).quantity_meters, before);
  });

  await record('invalid and insufficient operations rollback atomically', async () => {
    await assert.rejects(call('orders:create', { id: 'ORD-INCOMPLETE', customerId, fabricId, totalAmount: 100 }), /مفقودة|NOT NULL|إلزامية/);
    await assert.rejects(call('orders:create', { id: 'ORD-LOW-STOCK', orderNumber: 'INT-LOW', customerId, customerName: 'عميل تكامل', customerPhone: '0500000001', fabricId, fabricName: 'قماش تكامل', garmentCount: 100, totalAmount: 1000 }), /غير كافية/);
    const db = manager.getRawDb();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE id IN (?, ?)').get('ORD-INCOMPLETE', 'ORD-LOW-STOCK').count, 0);
  });

  await record('abrupt close during an uncommitted SQLite write rolls back safely', async () => {
    const db = manager.getRawDb();
    db.exec('CREATE TABLE IF NOT EXISTS integration_crash_probe (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)');
    db.prepare('DELETE FROM integration_crash_probe').run();
    db.prepare('INSERT INTO integration_crash_probe (value) VALUES (?)').run('committed-write');
    const child = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'abrupt-write.cjs'), path.join(databaseDir, 'sahwa_tailoring.db')], {
      encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    assert.notEqual(child.status, 0);
    const values = db.prepare('SELECT value FROM integration_crash_probe ORDER BY id').all().map((row) => row.value);
    assert.deepEqual(values, ['committed-write']);
  });

  await record('offline local workflow and graceful close/reopen', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('network disabled for offline test'); };
    try {
      const settings = await call('settings:get');
      assert.equal(settings.fabricConsumptionRatePerGarment, 3.5);
      const orders = await call('orders:list');
      assert.equal(orders.some((item) => item.id === orderId), true);
    } finally {
      global.fetch = originalFetch;
    }
    await manager.close();
    const reopened = new SahwaDatabaseManager(databaseDir, undefined, backupDir);
    const reopenedInit = reopened.initDatabase();
    assert.equal(reopenedInit.success, true);
    assert.equal(reopened.getRawDb().prepare('SELECT COUNT(*) AS count FROM orders WHERE id = ?').get(orderId).count, 1);

    const reopenedDb = reopened.getRawDb();
    reopenedDb.prepare(`
      INSERT INTO customer_credits (id, customer_id, order_id, invoice_id, payment_id, entry_type, amount, reference_id, notes, created_at, operation_id, idempotency_key, method, actor_id, reason, occurred_at, balance_after)
      VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?, 'customer_credit', ?, ?, ?, ?)
    `).run(
      'CREDIT-CLEAR-001', customerId, orderId, null, 'PAY-CLEAR-001', 25,
      'OVERPAYMENT-CLEAR-001', 'clearAllData regression fixture', new Date().toISOString(),
      'OP-CLEAR-001', 'IDEMP-CLEAR-001', 'integration-test', 'fixture', new Date().toISOString(), 25
    );
    assert.equal(reopenedDb.prepare('SELECT COUNT(*) AS count FROM customer_credits WHERE id = ?').get('CREDIT-CLEAR-001').count, 1);
    assert.equal(await reopened.clearAllData(), true);
    assert.equal(reopenedDb.prepare('SELECT COUNT(*) AS count FROM customer_credits').get().count, 0);
    assert.equal(reopenedDb.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 0);
    assert.equal(reopenedDb.pragma('foreign_key_check').length, 0);
    await reopened.close();
  });

  console.log(JSON.stringify({ ok: true, root, results }, null, 2));
  await app.quit();
}

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: error?.stack || error?.message || String(error), results }, null, 2));
  try { await app.quit(); } catch {}
  process.exitCode = 1;
});
