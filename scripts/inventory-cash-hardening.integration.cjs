const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, ipcMain } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

function registry() { return ipcMain._invokeHandlers || ipcMain._invokeHandlersMap; }
async function call(channel, ...args) {
  const entry = registry().get(channel);
  const handler = typeof entry === 'function' ? entry : entry?.callback;
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`);
  return handler({ sender: null }, ...args);
}
async function expectReject(promise, pattern) {
  await promise.then(() => { throw new Error('Expected rejection'); }, (error) => {
    if (pattern) assert.match(String(error?.message || error), pattern);
  });
}

async function main() {
  await app.whenReady();
  process.env.SAHWA_ACTOR_ID = 'inventory-cash-integration-user';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-inventory-cash-'));
  const manager = new SahwaDatabaseManager(path.join(root, 'database'), undefined, path.join(root, 'backups'));
  const init = manager.initDatabase();
  assert.equal(init.success, true, init.error || 'database initialization failed');
  const db = manager.getRawDb();
  const customer = db.prepare('SELECT id, name, phone FROM customers ORDER BY id LIMIT 1').get();
  assert.ok(customer, 'seed customer required');
  db.prepare(`INSERT INTO fabrics (id, name, color, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('FAB-INV-CASH', 'Inventory Hardening Fabric', 'أبيض', 10, 100, 10, 2, new Date().toISOString());
  registerIpcHandlers(manager);

  const purchase = await call('purchases:create', {
    id: 'PUR-INV-CASH-1', supplier: 'WAC Supplier', purchaseDate: '2026-08-20', paymentMethod: 'cash',
    lines: [{ itemType: 'fabric', itemId: 'FAB-INV-CASH', itemName: 'Inventory Hardening Fabric', quantity: 10, unit: 'متر', unitPrice: 20 }]
  });
  assert.equal(purchase.id, 'PUR-INV-CASH-1');
  let fabric = db.prepare('SELECT quantity_meters, purchase_price FROM fabrics WHERE id = ?').get('FAB-INV-CASH');
  assert.equal(fabric.quantity_meters, 20);
  assert.equal(fabric.purchase_price, 15);
  const original = db.prepare("SELECT * FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id = ?").get('PUR-INV-CASH-1');
  assert.equal(original.unit_cost, 20);

  await call('stock:returnPurchase', { itemType: 'fabric', itemId: 'FAB-INV-CASH', quantity: 5, reason: 'Production purchase return', originalMovementId: original.id, purchaseId: 'PUR-INV-CASH-RETURN', actorId: 'warehouse-user' });
  fabric = db.prepare('SELECT quantity_meters, purchase_price FROM fabrics WHERE id = ?').get('FAB-INV-CASH');
  assert.equal(fabric.quantity_meters, 15);
  assert.equal(fabric.purchase_price, 13.3333);
  const returned = db.prepare("SELECT * FROM inventory_movements WHERE reference_type = 'purchase_return'").get();
  assert.deepEqual({ unit_cost: returned.unit_cost, total_cost: returned.total_cost, source_movement_id: returned.source_movement_id, actor_id: returned.actor_id }, { unit_cost: 20, total_cost: 100, source_movement_id: original.id, actor_id: 'warehouse-user' });
  await expectReject(call('stock:returnPurchase', { itemType: 'fabric', itemId: 'FAB-INV-CASH', quantity: 99, reason: 'Too much return', originalMovementId: original.id, purchaseId: 'PUR-INV-CASH-RETURN-INVALID', actorId: 'warehouse-user' }), /غير كافية|insufficient/);

  const order = await call('orders:create', {
    id: 'ORD-INV-CASH-CANCEL', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
    fabricId: 'FAB-INV-CASH', fabricName: 'Inventory Hardening Fabric', fabricColor: 'أبيض', garmentCount: 1,
    totalAmount: 100, paidAmount: 0, orderDate: '2026-08-20', deliveryDate: '2026-08-25', measurements: {}, styleDetails: {}
  });
  const beforeCancel = db.prepare('SELECT purchase_price, quantity_meters FROM fabrics WHERE id = ?').get('FAB-INV-CASH');
  const usage = db.prepare('SELECT quantity, unit_cost_at_usage FROM order_material_usages WHERE order_id = ?').get(order.id);
  await call('purchases:create', { id: 'PUR-INV-CASH-AFTER', supplier: 'Later Supplier', purchaseDate: '2026-08-20', paymentMethod: 'cash', lines: [{ itemType: 'fabric', itemId: 'FAB-INV-CASH', itemName: 'Inventory Hardening Fabric', quantity: 10, unit: 'متر', unitPrice: 30 }] });
  const wacBeforeCancel = db.prepare('SELECT purchase_price FROM fabrics WHERE id = ?').get('FAB-INV-CASH').purchase_price;
  await call('orders:updateStatus', { orderId: order.id, status: 'cancelled' });
  fabric = db.prepare('SELECT quantity_meters, purchase_price FROM fabrics WHERE id = ?').get('FAB-INV-CASH');
  const cancelReturn = db.prepare("SELECT * FROM inventory_movements WHERE reference_type = 'order_cancel' AND reference_id = ?").get(order.id);
  assert.equal(cancelReturn.unit_cost, usage.unit_cost_at_usage);
  assert.equal(fabric.purchase_price, wacBeforeCancel);
  assert.equal(fabric.quantity_meters, beforeCancel.quantity_meters + 10 + usage.quantity);

  await expectReject(call('cash:createAdjustment', { direction: 'in', sourceType: 'purchase', amount: 10, paymentMethod: 'cash', transactionDate: '2026-08-20', description: 'forbidden direct source' }), /مصدر الحركة اليدوية غير صالح|invalid/);
  await call('cash:createAdjustment', { direction: 'out', sourceType: 'withdrawal', amount: 50, paymentMethod: 'cash', transactionDate: '2026-08-20', description: 'وثيقة سحب', actorId: 'cashier-user', reason: 'سبب السحب' });
  const cash = db.prepare("SELECT source_type, actor_id, reason FROM cash_transactions WHERE source_type = 'withdrawal' ORDER BY created_at DESC LIMIT 1").get();
  assert.deepEqual(cash, { source_type: 'withdrawal', actor_id: 'cashier-user', reason: 'سبب السحب' });

  const integrity = await call('system:integrityCheck');
  assert.equal(integrity.ok, true, JSON.stringify(integrity));
  console.log(JSON.stringify({ ok: true, tests: ['purchase_wac', 'purchase_return_original_cost', 'purchase_return_overstock_rejection', 'cancel_return_snapshot_cost', 'cash_whitelist', 'cash_audit_metadata', 'integrity'], schemaVersion: db.prepare("SELECT value FROM system_settings WHERE key='schemaVersion'").get()?.value }, null, 2));
  await manager.close();
  fs.rmSync(root, { recursive: true, force: true });
  await app.quit();
}

main().catch(async (error) => {
  console.error(error?.stack || error);
  try { await app.quit(); } catch {}
  process.exitCode = 1;
});
