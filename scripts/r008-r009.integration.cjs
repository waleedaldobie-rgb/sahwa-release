const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

const asJson = (value) => JSON.stringify(value);

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r008-r009-'));
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
    await window.loadURL('data:text/html,<html><body>R008-R009</body></html>');

    const call = (name, ...args) => window.webContents.executeJavaScript(
      `window.electronAPI[${asJson(name)}](...${asJson(args)})`
    );
    const customers = await call('getCustomers');
    const customer = customers[0];
    assert.ok(customer, 'seed customer is required');

    const createFabric = async (id, quantityMeters) => call('createFabric', {
      id, name: id, color: 'أبيض', colorHex: '#fff', purchasePrice: 10, sellingPrice: 20,
      quantityMeters, minStockMeters: 1
    });
    const createAccessory = async (id, quantity) => call('createAccessory', {
      id, name: id, category: 'R009', quantity, minStock: 1, unit: 'حبة', purchasePrice: 2, sellingPrice: 4
    });
    const createOrder = async (id, fabricId, materialUsages = []) => call('createOrder', {
      id,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      fabricId,
      fabricName: fabricId || 'بدون قماش',
      fabricColor: 'أبيض',
      garmentCount: 1,
      totalAmount: 100,
      paidAmount: 0,
      materialUsages
    });
    const getFabric = async (id) => (await call('getFabrics')).find((item) => item.id === id);
    const getAccessory = async (id) => (await call('getAccessories')).find((item) => item.id === id);
    const getOrder = async (id) => (await call('getOrders')).find((item) => item.id === id);
    const expectRejected = async (action, expectedText) => {
      await assert.rejects(action, (error) => {
        assert.match(String(error?.message || error), expectedText);
        return true;
      });
    };

    // R-008: active order rate change rebuilds usage, movement, stock, and cost.
    await call('updateSetting', { key: 'fabricConsumptionRatePerGarment', value: 3.5 });
    await createFabric('R008-FABRIC-ACTIVE', 30);
    const activeCreated = await createOrder('R008-ORDER-ACTIVE', 'R008-FABRIC-ACTIVE');
    const activeBefore = await getFabric('R008-FABRIC-ACTIVE');
    assert.equal(activeBefore.quantityMeters, 26.5);
    await call('updateSetting', { key: 'fabricConsumptionRatePerGarment', value: 4 });
    await call('updateOrder', await getOrder(activeCreated.id));
    const activeAfter = await getFabric('R008-FABRIC-ACTIVE');
    const activeOrder = await getOrder(activeCreated.id);
    const activeUsages = await call('getOrderMaterialUsages', activeCreated.id);
    const activeMovements = await call('getStockMovements', 'fabric', 'R008-FABRIC-ACTIVE');
    assert.equal(activeAfter.quantityMeters, 26);
    assert.equal(activeOrder.fabricConsumptionMeters, 4);
    assert.equal(activeUsages.length, 1);
    assert.equal(activeUsages[0].quantity, 4);
    assert.equal(activeUsages[0].totalCost, 40);
    assert.equal(activeMovements.filter((movement) => movement.direction === 'return').length, 1);
    assert.equal(activeMovements.filter((movement) => movement.direction === 'sale')[0].quantity, 4);

    // R-008: failed replacement sale rolls the whole update back.
    await call('updateSetting', { key: 'fabricConsumptionRatePerGarment', value: 3 });
    await createFabric('R008-FABRIC-ROLLBACK', 4);
    const rollbackCreated = await createOrder('R008-ORDER-ROLLBACK', 'R008-FABRIC-ROLLBACK');
    await call('updateSetting', { key: 'fabricConsumptionRatePerGarment', value: 5 });
    await expectRejected(async () => call('updateOrder', await getOrder(rollbackCreated.id)), /غير كافية|insufficient/i);
    const rollbackFabric = await getFabric('R008-FABRIC-ROLLBACK');
    const rollbackOrder = await getOrder(rollbackCreated.id);
    const rollbackUsage = await call('getOrderMaterialUsages', rollbackCreated.id);
    assert.equal(rollbackFabric.quantityMeters, 1);
    assert.equal(rollbackOrder.fabricConsumptionMeters, 3);
    assert.equal(rollbackUsage[0].quantity, 3);

    // R-008: cancelled -> edit -> reactivate consumes only the new snapshot.
    await call('updateSetting', { key: 'fabricConsumptionRatePerGarment', value: 3 });
    await createFabric('R008-FABRIC-CANCEL', 30);
    const cancelledCreated = await createOrder('R008-ORDER-CANCEL', 'R008-FABRIC-CANCEL');
    await call('updateOrderStatus', { orderId: cancelledCreated.id, status: 'cancelled' });
    await call('updateSetting', { key: 'fabricConsumptionRatePerGarment', value: 5 });
    await call('updateOrder', await getOrder(cancelledCreated.id));
    assert.equal((await getFabric('R008-FABRIC-CANCEL')).quantityMeters, 30);
    const cancelledUsage = await call('getOrderMaterialUsages', cancelledCreated.id);
    assert.equal(cancelledUsage[0].quantity, 5);
    assert.equal(cancelledUsage[0].sourceMovementId, undefined);
    await call('updateOrderStatus', { orderId: cancelledCreated.id, status: 'new' });
    const reactivatedFabric = await getFabric('R008-FABRIC-CANCEL');
    const reactivatedUsage = await call('getOrderMaterialUsages', cancelledCreated.id);
    assert.equal(reactivatedFabric.quantityMeters, 25);
    assert.equal(reactivatedUsage[0].quantity, 5);
    assert.ok(reactivatedUsage[0].sourceMovementId);

    if (process.env.R008_ONLY === '1') {
      console.log(JSON.stringify({ ok: true, r008: 'passed', r009: 'skipped_by_explicit_mode' }, null, 2));
      return;
    }

    // R-009: used Fabric and Accessory cannot be hard-deleted.
    await call('updateSetting', { key: 'fabricConsumptionRatePerGarment', value: 3.5 });
    await createFabric('R009-FABRIC-USED', 20);
    const usedFabricOrder = await createOrder('R009-ORDER-FABRIC', 'R009-FABRIC-USED');
    await expectRejected(() => call('deleteFabric', 'R009-FABRIC-USED'), /لا يمكن حذف (القماش|هذا الصنف)/);
    assert.ok(await getFabric('R009-FABRIC-USED'));
    assert.ok(usedFabricOrder.id);

    await createAccessory('R009-ACCESSORY-USED', 10);
    await createOrder('R009-ORDER-ACCESSORY', null, [{
      itemType: 'accessory', itemId: 'R009-ACCESSORY-USED', itemName: 'R009-ACCESSORY-USED',
      quantity: 1, unit: 'حبة', unitCostAtUsage: 2
    }]);
    await expectRejected(() => call('deleteAccessory', 'R009-ACCESSORY-USED'), /لا يمكن حذف (الإكسسوار|هذا الصنف)/);
    assert.ok(await getAccessory('R009-ACCESSORY-USED'));

    // R-009: inventory movement history alone blocks deletion.
    await createFabric('R009-FABRIC-MOVEMENT', 10);
    await call('adjustStock', { itemType: 'fabric', itemId: 'R009-FABRIC-MOVEMENT', quantity: 1, reason: 'R009 movement history' });
    await expectRejected(() => call('deleteFabric', 'R009-FABRIC-MOVEMENT'), /لا يمكن حذف (القماش|هذا الصنف)/);
    assert.ok(await getFabric('R009-FABRIC-MOVEMENT'));

    // R-009: purchase-line history alone blocks deletion.
    await createFabric('R009-FABRIC-PURCHASE', 10);
    db.prepare(`
      INSERT INTO purchases (id, supplier, invoice_number, purchase_date, total_amount, payment_method, notes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('R009-PURCHASE-1', 'R009', 'R009-INV', '2026-08-20', 20, 'cash', null, 'approved', '2026-08-20T00:00:00.000Z');
    db.prepare(`
      INSERT INTO purchase_lines (id, purchase_id, item_type, item_id, item_name, quantity, unit, unit_price, total_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('R009-LINE-1', 'R009-PURCHASE-1', 'fabric', 'R009-FABRIC-PURCHASE', 'R009-FABRIC-PURCHASE', 2, 'متر', 10, 20, '2026-08-20T00:00:00.000Z');
    await expectRejected(() => call('deleteFabric', 'R009-FABRIC-PURCHASE'), /لا يمكن حذف (القماش|هذا الصنف)/);
    assert.ok(await getFabric('R009-FABRIC-PURCHASE'));

    console.log(JSON.stringify({
      ok: true,
      r008: [
        'active consumption rate rebuild',
        'failed replacement rollback',
        'cancel edit reactivate new snapshot'
      ],
      r009: [
        'used fabric deletion rejected',
        'used accessory deletion rejected',
        'inventory history deletion rejected',
        'purchase line history deletion rejected'
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
