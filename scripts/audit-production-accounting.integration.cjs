const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');
const XLSX = require('xlsx');

const issueCodes = (report) => report.issues.map((issue) => issue.code);

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-production-audit-'));
  let manager;
  let window;
  try {
    await app.whenReady();
    manager = new SahwaDatabaseManager(root);
    const initialized = manager.initDatabase();
    assert.equal(initialized.success, true, initialized.error || 'database initialization failed');
    registerIpcHandlers(manager);
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.resolve(__dirname, '../dist-electron/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await window.loadURL('data:text/html,<html><body>production-audit</body></html>');
    const call = (name, ...args) => window.webContents.executeJavaScript(`window.electronAPI[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
    const raw = manager.getRawDb();

    await call('createFabric', {
      id: 'AUDIT-FABRIC', name: 'Audit Fabric', color: 'White', colorHex: '#fff',
      purchasePrice: 10, sellingPrice: 20, quantityMeters: 20, minStockMeters: 1
    });
    await call('createAccessory', {
      id: 'AUDIT-ACCESSORY', name: 'Audit Accessory', category: 'Audit',
      quantity: 4, minStock: 1, unit: 'piece', purchasePrice: 3, sellingPrice: 5
    });

    const createdAtBeforeRestore = raw.prepare('SELECT created_at FROM fabrics WHERE id = ?').get('AUDIT-FABRIC').created_at;
    const rejected = await call('createCashAdjustment', {
      sourceType: 'customer_payment', sourceId: 'FORGED-PAYMENT', direction: 'in',
      amount: 20, paymentMethod: 'cash', description: 'forged source'
    }).then(() => false, () => true);
    assert.equal(rejected, true, 'Production IPC must reject protected cash source types');
    assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM cash_transactions').get().count, 0);

    await call('createExpense', {
      id: 'AUDIT-EXPENSE', category: 'تشغيل', amount: 25, expenseDate: '2026-08-20',
      paymentMethod: 'cash', description: 'Audit expense'
    });
    let report = await call('checkDatabaseIntegrity');
    assert.equal(report.ok, true, JSON.stringify(report.issues));

    const expenseCash = raw.prepare("SELECT * FROM cash_transactions WHERE source_type = 'expense' AND source_id = ?").get('AUDIT-EXPENSE');
    assert.ok(expenseCash, 'expense cash ledger row should exist before corruption');
    raw.prepare("DELETE FROM cash_transactions WHERE source_type = 'expense' AND source_id = ?").run('AUDIT-EXPENSE');
    report = await call('checkDatabaseIntegrity');
    assert.equal(report.ok, false);
    assert.ok(issueCodes(report).includes('MISSING_EXPENSE_CASH'), JSON.stringify(report.issues));

    raw.prepare(`
      INSERT INTO cash_transactions
      (id, direction, source_type, source_id, order_id, reference_number, amount, payment_method, transaction_date, description, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('AUDIT-EXPENSE-CASH', 'out', 'expense', 'AUDIT-EXPENSE', null, 'AUDIT-EXPENSE', 24, expenseCash.payment_method, expenseCash.transaction_date, expenseCash.description, null, expenseCash.created_at);
    report = await call('checkDatabaseIntegrity');
    assert.equal(report.ok, false);
    assert.ok(issueCodes(report).includes('EXPENSE_CASH_MISMATCH'), JSON.stringify(report.issues));

    await call('createCustomer', { id: 'AUDIT-CUSTOMER', name: 'Audit Customer', phone: '0500000001', measurements: {}, styleDetails: {} });
    await call('createOrder', {
      id: 'AUDIT-ORDER', orderNumber: 'AUDIT-ORDER-1', customerId: 'AUDIT-CUSTOMER', customerName: 'Audit Customer', customerPhone: '0500000001',
      thobeTypeName: 'ثوب', fabricId: 'AUDIT-FABRIC', fabricName: 'Audit Fabric', fabricColor: 'White', garmentCount: 1,
      orderDate: '2026-08-19', deliveryDate: '2026-08-25', status: 'new', totalAmount: 100, paidAmount: 100,
      initialPaymentMethod: 'cash', measurements: {}, styleDetails: {}
    });
    raw.prepare("UPDATE invoices SET payment_status = 'unpaid' WHERE order_id = ?").run('AUDIT-ORDER');
    report = await call('checkDatabaseIntegrity');
    assert.equal(report.ok, false);
    assert.ok(issueCodes(report).includes('INVOICE_STATUS_MISMATCH'), JSON.stringify(report.issues));

    raw.prepare("UPDATE invoices SET payment_status = 'paid' WHERE order_id = ?").run('AUDIT-ORDER');

    await call('createOrder', {
      id: 'AUDIT-OLD-ORDER', orderNumber: 'AUDIT-OLD-1', customerId: 'AUDIT-CUSTOMER', customerName: 'Audit Customer', customerPhone: '0500000001',
      thobeTypeName: 'ثوب', fabricId: 'AUDIT-FABRIC', fabricName: 'Audit Fabric', fabricColor: 'White', garmentCount: 1,
      orderDate: '2026-08-01', deliveryDate: '2026-08-25', status: 'new', totalAmount: 200, paidAmount: 0,
      initialPaymentMethod: 'cash', measurements: {}, styleDetails: {}
    });
    await call('addPayment', { invoiceId: 'INV-AUDIT-OLD-1', amount: 50, method: 'cash', note: 'تحصيل داخل الفترة', paymentId: 'AUDIT-OLD-PAY' });
    const reportBuffer = await manager.generateExcelReport('2026-08-20', '2026-08-20');
    const workbook = XLSX.read(reportBuffer, { type: 'buffer' });
    const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets['ملخص المحاسبة']);
    const summary = new Map(summaryRows.map((row) => [row['البيان'], row['القيمة']]));
    assert.equal(Number(summary.get('إجمالي المبيعات')), 0, 'old order must not become current-period sales');
    assert.equal(Number(summary.get('إجمالي التحصيل')), 50, 'collection date must drive period collections');
    assert.equal(Number(summary.get('المبالغ المتبقية')), 150, 'open balances must include active orders regardless of order date');
    raw.prepare('DELETE FROM cash_transactions WHERE id = ?').run('AUDIT-EXPENSE-CASH');
    raw.prepare(`
      INSERT INTO cash_transactions
      (id, direction, source_type, source_id, order_id, reference_number, amount, payment_method, transaction_date, description, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('CASH-EXP-AUDIT-EXPENSE', 'out', 'expense', 'AUDIT-EXPENSE', null, 'AUDIT-EXPENSE', 25, expenseCash.payment_method, expenseCash.transaction_date, expenseCash.description, null, expenseCash.created_at);
    const healthyBackup = await call('exportBackup');
    const beforeRestoreCount = raw.prepare('SELECT COUNT(*) AS count FROM customers').get().count;
    const originalBackup = manager.backupDatabase.bind(manager);
    manager.backupDatabase = async () => ({ success: false, error: 'injected backup failure' });
    const failedRestore = await manager.restoreFromJson(healthyBackup);
    manager.backupDatabase = originalBackup;
    assert.equal(failedRestore.success, false);
    assert.match(failedRestore.error, /نسخة أمان|backup/i);
    assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM customers').get().count, beforeRestoreCount);

    const restored = await manager.restoreFromJson(healthyBackup);
    assert.equal(restored.success, true, restored.error || 'restore failed');
    const createdAtAfterRestore = raw.prepare('SELECT created_at FROM fabrics WHERE id = ?').get('AUDIT-FABRIC').created_at;
    assert.equal(createdAtAfterRestore, createdAtBeforeRestore, 'Restore must preserve fabric created_at');

    console.log(JSON.stringify({
      ok: true,
      checks: [
        'Production rejects protected manual cash source types',
        'Live Integrity detects missing expense cash linkage',
        'Live Integrity detects expense cash amount mismatch',
        'Live Integrity detects invoice payment_status mismatch',
        'Restore stops when pre-restore backup fails and preserves data',
        'Restore preserves fabric created_at'
      ]
    }, null, 2));
  } finally {
    try { window?.destroy(); } catch {}
    try { await manager?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
    if (app.isReady()) await app.quit();
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  if (app.isReady()) app.exit(1);
  else process.exit(1);
});
