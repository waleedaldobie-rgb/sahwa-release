const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

function movement(id, itemType, itemId, referenceType = null, referenceId = null) {
  return {
    id,
    itemType,
    itemId,
    itemName: 'R010 fixture',
    direction: referenceType === 'order' ? 'sale' : 'adjustment',
    quantity: 1,
    quantityBefore: 10,
    quantityAfter: 9,
    unit: itemType === 'fabric' ? 'متر' : 'حبة',
    reason: 'R010 integrity fixture',
    referenceType,
    referenceId,
    referenceNumber: null,
    createdAt: '2026-08-20T00:00:00.000Z'
  };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r010-integrity-'));
  let manager;
  let window;
  try {
    await app.whenReady();
    manager = new SahwaDatabaseManager(root);
    const initialized = manager.initDatabase();
    assert.equal(initialized.success, true, initialized.error || 'database initialization failed');
    registerIpcHandlers(manager);

    const db = manager.getRawDb();
    const fabric = db.prepare('SELECT id, quantity_meters FROM fabrics ORDER BY id LIMIT 1').get();
    assert.ok(fabric, 'seed fabric is required for R010 fixture');
    const originalQuantity = fabric.quantity_meters;

    const insert = db.prepare(`
      INSERT INTO inventory_movements (
        id, item_type, item_id, item_name, direction, quantity,
        quantity_before, quantity_after, unit, reason,
        reference_type, reference_id, reference_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.resolve(__dirname, '../dist-electron/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await window.loadURL('data:text/html,<html><body>R010</body></html>');
    const checkLiveIntegrity = () => window.webContents.executeJavaScript('window.electronAPI.checkDatabaseIntegrity()');

    insert.run(...Object.values(movement('R010-ORPHAN-FABRIC', 'fabric', 'MISSING-FABRIC')));
    let report = await checkLiveIntegrity();
    assert.ok(report.issues.some((issue) => issue.code === 'ORPHAN_INVENTORY_MOVEMENT' && issue.recordId === 'R010-ORPHAN-FABRIC'));
    db.prepare('DELETE FROM inventory_movements WHERE id = ?').run('R010-ORPHAN-FABRIC');

    insert.run(...Object.values(movement('R010-ORPHAN-ACCESSORY', 'accessory', 'MISSING-ACCESSORY')));
    report = await checkLiveIntegrity();
    assert.ok(report.issues.some((issue) => issue.code === 'ORPHAN_INVENTORY_MOVEMENT' && issue.recordId === 'R010-ORPHAN-ACCESSORY'));
    db.prepare('DELETE FROM inventory_movements WHERE id = ?').run('R010-ORPHAN-ACCESSORY');

    db.prepare('UPDATE fabrics SET quantity_meters = ? WHERE id = ?').run(9, fabric.id);
    insert.run(...Object.values(movement('R010-ORPHAN-ORDER-REF', 'fabric', fabric.id, 'order', 'MISSING-ORDER')));
    report = await checkLiveIntegrity();
    assert.ok(report.issues.some((issue) => issue.code === 'ORPHAN_INVENTORY_REFERENCE' && issue.recordId === 'R010-ORPHAN-ORDER-REF'));
    db.prepare('DELETE FROM inventory_movements WHERE id = ?').run('R010-ORPHAN-ORDER-REF');
    db.prepare('UPDATE fabrics SET quantity_meters = ? WHERE id = ?').run(originalQuantity, fabric.id);

    report = await checkLiveIntegrity();
    assert.equal(report.ok, true, JSON.stringify(report.issues));

    console.log(JSON.stringify({
      ok: true,
      via: 'preload -> IPC system:integrityCheck -> DatabaseIntegrityService.check',
      liveChecks: [
        'orphan fabric inventory movement',
        'orphan accessory inventory movement',
        'orphan order reference on sale movement'
      ],
      cleanDatabaseAfterFixture: true
    }, null, 2));
  } finally {
    try { window?.destroy(); } catch {}
    try { await manager?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
    if (app.isReady()) await app.quit();
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
