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
  process.env.SAHWA_ACTOR_ID = 'ids-notifications-integration-user';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-ids-notifications-'));
  const manager = new SahwaDatabaseManager(path.join(root, 'database'), undefined, path.join(root, 'backups'));
  const init = manager.initDatabase();
  assert.equal(init.success, true, init.error || 'database initialization failed');
  const db = manager.getRawDb();
  const customer = db.prepare('SELECT id, name, phone FROM customers ORDER BY id LIMIT 1').get();
  assert.ok(customer, 'seed customer required');
  registerIpcHandlers(manager);

  const createOrder = (label) => call('orders:create', {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    thobeTypeName: 'Sequence Test',
    fabricName: 'بدون قماش',
    fabricColor: 'أبيض',
    garmentCount: 1,
    totalAmount: 100,
    paidAmount: 0,
    orderDate: '2026-08-20',
    deliveryDate: '2026-08-21',
    measurements: {},
    styleDetails: {},
    notes: label
  });
  const [first, second] = await Promise.all([createOrder('concurrent-a'), createOrder('concurrent-b')]);
  assert.notEqual(first.id, second.id);
  assert.deepEqual([first.orderNumber, second.orderNumber].sort(), ['1001', '1002']);
  const invoiceNumbers = db.prepare('SELECT invoice_number FROM invoices ORDER BY invoice_number').all().map((row) => row.invoice_number);
  assert.deepEqual(invoiceNumbers, ['INV-1001', 'INV-1002']);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT order_number) AS n FROM orders').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT id) AS n FROM orders').get().n, 2);

  process.env.SAHWA_FORCE_WHATSAPP_FAILURE = '1';
  assert.equal(await call('whatsapp:send', { phone: customer.phone, customerName: customer.name, orderNumber: first.orderNumber, statusText: 'جاهز' }), false);
  assert.equal(await call('whatsapp:send', { phone: customer.phone, customerName: customer.name, orderNumber: first.orderNumber, statusText: 'جاهز' }), false);
  let notifications = await call('notifications:list', true);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].status, 'failed');
  assert.match(notifications[0].lastError, /forced failure/);
  const notificationId = notifications[0].id;
  assert.equal((await call('notifications:markAllRead')).updated, 1);
  await call('notifications:retry', notificationId);
  await call('notifications:retry', notificationId);
  await call('notifications:retry', notificationId);
  await expectReject(call('notifications:retry', notificationId), /الحد الأقصى/);
  notifications = await call('notifications:list', true);
  assert.equal(notifications[0].retryCount, 3);
  assert.equal(notifications[0].retryHistory.length, 5);
  assert.equal((await call('notifications:clearAll')).archived, 1);
  assert.equal((await call('notifications:list', false)).length, 0);
  assert.equal((await call('notifications:list', true)).length, 1);

  const integrity = await call('system:integrityCheck');
  assert.equal(integrity.ok, true, JSON.stringify(integrity));
  console.log(JSON.stringify({ ok: true, tests: ['concurrent_order_sequence', 'unique_record_ids', 'invoice_number_alignment', 'whatsapp_failure_no_false_success', 'notification_upsert_by_source', 'read_archive_without_delete', 'retry_cap', 'integrity'], schemaVersion: db.prepare("SELECT value FROM system_settings WHERE key='schemaVersion'").get()?.value }, null, 2));
  manager.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  fs.rmSync(root, { recursive: true, force: true });
  await app.quit();
}

main().catch(async (error) => {
  console.error(error?.stack || error);
  try { await app.quit(); } catch {}
  process.exitCode = 1;
});
