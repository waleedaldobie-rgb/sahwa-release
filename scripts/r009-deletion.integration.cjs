const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r009-'));
  let manager;
  let window;
  try {
    await app.whenReady();
    manager = new SahwaDatabaseManager(root);
    const initialized = manager.initDatabase();
    assert.equal(initialized.success, true, initialized.error || 'database initialization failed');
    registerIpcHandlers(manager);
    const db = manager.getRawDb();
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.resolve(__dirname, '../dist-electron/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await window.loadURL('data:text/html,<html><body>R009</body></html>');
    const call = (name, ...args) => window.webContents.executeJavaScript(`window.electronAPI[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
    const customers = await call('getCustomers');
    const customer = customers[0];
    assert.ok(customer, 'seed customer is required');
    const expectRejected = async (action, text) => assert.rejects(action, (error) => {
      assert.match(String(error?.message || error), text);
      return true;
    });
    const createFabric = (id, quantityMeters) => call('createFabric', { id, name: id, color: 'أبيض', colorHex: '#fff', purchasePrice: 10, sellingPrice: 20, quantityMeters, minStockMeters: 1 });
    const createAccessory = (id, quantity) => call('createAccessory', { id, name: id, category: 'R009', quantity, minStock: 1, unit: 'حبة', purchasePrice: 2, sellingPrice: 4 });
    const createOrder = (id, fabricId, materialUsages = []) => call('createOrder', { id, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, fabricId, fabricName: fabricId || 'بدون قماش', fabricColor: 'أبيض', garmentCount: 1, totalAmount: 100, paidAmount: 0, materialUsages });
    const fabric = (id) => call('getFabrics').then((items) => items.find((item) => item.id === id));
    const accessory = (id) => call('getAccessories').then((items) => items.find((item) => item.id === id));

    await createFabric('R009-FABRIC-USED', 20);
    await createOrder('R009-ORDER-FABRIC', 'R009-FABRIC-USED');
    await expectRejected(() => call('deleteFabric', 'R009-FABRIC-USED'), /لا يمكن حذف (القماش|هذا الصنف)/);
    assert.ok(await fabric('R009-FABRIC-USED'));

    await createAccessory('R009-ACCESSORY-USED', 10);
    await createOrder('R009-ORDER-ACCESSORY', null, [{ itemType: 'accessory', itemId: 'R009-ACCESSORY-USED', itemName: 'R009-ACCESSORY-USED', quantity: 1, unit: 'حبة', unitCostAtUsage: 2 }]);
    await expectRejected(() => call('deleteAccessory', 'R009-ACCESSORY-USED'), /لا يمكن حذف (الإكسسوار|هذا الصنف)/);
    assert.ok(await accessory('R009-ACCESSORY-USED'));

    await createFabric('R009-FABRIC-MOVEMENT', 10);
    await call('adjustStock', { itemType: 'fabric', itemId: 'R009-FABRIC-MOVEMENT', quantity: 1, reason: 'R009 movement history' });
    await expectRejected(() => call('deleteFabric', 'R009-FABRIC-MOVEMENT'), /لا يمكن حذف (القماش|هذا الصنف)/);
    assert.ok(await fabric('R009-FABRIC-MOVEMENT'));

    await createFabric('R009-FABRIC-PURCHASE', 10);
    db.prepare(`INSERT INTO purchases (id, supplier, invoice_number, purchase_date, total_amount, payment_method, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('R009-PURCHASE-1', 'R009', 'R009-INV', '2026-08-20', 20, 'cash', null, 'approved', '2026-08-20T00:00:00.000Z');
    db.prepare(`INSERT INTO purchase_lines (id, purchase_id, item_type, item_id, item_name, quantity, unit, unit_price, total_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('R009-LINE-1', 'R009-PURCHASE-1', 'fabric', 'R009-FABRIC-PURCHASE', 'R009-FABRIC-PURCHASE', 2, 'متر', 10, 20, '2026-08-20T00:00:00.000Z');
    await expectRejected(() => call('deleteFabric', 'R009-FABRIC-PURCHASE'), /لا يمكن حذف (القماش|هذا الصنف)/);
    assert.ok(await fabric('R009-FABRIC-PURCHASE'));

    console.log(JSON.stringify({
      ok: true,
      checks: ['used fabric', 'used accessory', 'fabric inventory history', 'fabric purchase-line history']
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
