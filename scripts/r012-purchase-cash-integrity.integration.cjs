const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

const issueCodes = (report) => report.issues.map((issue) => issue.code);

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r012-'));
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
    await window.loadURL('data:text/html,<html><body>R012</body></html>');
    const call = (name, ...args) => window.webContents.executeJavaScript(`window.electronAPI[${JSON.stringify(name)}](...${JSON.stringify(args)})`);

    await call('createFabric', {
      id: 'R012-FABRIC', name: 'R012-FABRIC', color: 'أبيض', colorHex: '#fff',
      purchasePrice: 10, sellingPrice: 20, quantityMeters: 2, minStockMeters: 1
    });
    await call('createPurchase', {
      id: 'R012-PURCHASE', supplier: 'R012 Supplier', invoiceNumber: 'R012-INV', purchaseDate: '2026-08-20', paymentMethod: 'cash',
      lines: [{ itemType: 'fabric', itemId: 'R012-FABRIC', itemName: 'R012-FABRIC', quantity: 3, unit: 'متر', unitPrice: 12 }]
    });

    const raw = manager.getRawDb();
    let report = await call('checkDatabaseIntegrity');
    assert.equal(report.ok, true, JSON.stringify(report.issues));
    const cashRow = raw.prepare("SELECT * FROM cash_transactions WHERE source_type = 'purchase' AND source_id = ?").get('R012-PURCHASE');
    assert.ok(cashRow, 'purchase cash ledger row is required');

    raw.prepare("DELETE FROM cash_transactions WHERE source_type = 'purchase' AND source_id = ?").run('R012-PURCHASE');
    report = await call('checkDatabaseIntegrity');
    assert.equal(report.ok, false);
    assert.ok(issueCodes(report).includes('MISSING_PURCHASE_CASH'));

    raw.prepare(`
      INSERT INTO cash_transactions
      (id, direction, source_type, source_id, order_id, reference_number, amount, payment_method, transaction_date, description, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cashRow.id, cashRow.direction, cashRow.source_type, cashRow.source_id, cashRow.order_id, cashRow.reference_number, cashRow.amount, cashRow.payment_method, cashRow.transaction_date, cashRow.description, cashRow.notes, cashRow.created_at);
    raw.prepare("UPDATE cash_transactions SET amount = amount + 1 WHERE source_type = 'purchase' AND source_id = ?").run('R012-PURCHASE');
    report = await call('checkDatabaseIntegrity');
    assert.equal(report.ok, false);
    assert.ok(issueCodes(report).includes('PURCHASE_CASH_MISMATCH'));

    const backup = JSON.parse(await call('exportBackup'));
    backup.cashTransactions = backup.cashTransactions.filter((cash) => !(cash.sourceType === 'purchase' && cash.sourceId === 'R012-PURCHASE'));
    const beforePurchaseCount = raw.prepare('SELECT COUNT(*) AS count FROM purchases').get().count;
    const restoreResult = await call('importBackup', JSON.stringify(backup));
    assert.equal(restoreResult.success, false);
    assert.match(restoreResult.error, /MISSING_PURCHASE_CASH/);
    assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM purchases').get().count, beforePurchaseCount);

    console.log(JSON.stringify({
      ok: true,
      checks: ['healthy purchase cash linkage', 'live missing cash detection', 'live amount mismatch detection', 'restore purchase cash rejection and atomicity']
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
