const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r011-'));
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
    await window.loadURL('data:text/html,<html><body>R011</body></html>');
    const call = (name, ...args) => window.webContents.executeJavaScript(`window.electronAPI[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
    const customers = await call('getCustomers');
    const customer = customers[0];
    assert.ok(customer, 'seed customer is required');

    await call('createFabric', {
      id: 'R011-FABRIC', name: 'R011-FABRIC', color: 'أبيض', colorHex: '#fff',
      purchasePrice: 10, sellingPrice: 20, quantityMeters: 20, minStockMeters: 1
    });
    const created = await call('createOrder', {
      id: 'R011-ORDER', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
      fabricId: 'R011-FABRIC', fabricName: 'R011-FABRIC', fabricColor: 'أبيض', garmentCount: 1,
      totalAmount: 100, paidAmount: 0
    });
    await call('updateOrderStatus', { orderId: created.id, status: 'cancelled' });

    const beforeOrders = await call('getOrders');
    const beforeInvoices = await call('getInvoices');
    const beforeCash = await call('getCashTransactions');
    const invoice = beforeInvoices.find((item) => item.orderId === created.id);
    assert.ok(invoice, 'cancelled order invoice is required');
    const beforeOrder = beforeOrders.find((item) => item.id === created.id);
    assert.equal(beforeOrder.status, 'cancelled');

    let rejected = false;
    try {
      await call('addPayment', { invoiceId: invoice.id, amount: 25, method: 'cash', note: 'R011 cancelled payment', paymentId: 'R011-PAYMENT' });
    } catch (error) {
      rejected = true;
      assert.match(String(error?.message || error), /ملغى|ملغاة|cancelled|cancel/i);
    }
    assert.equal(rejected, true, 'Production must reject payment on cancelled order');

    const afterOrders = await call('getOrders');
    const afterInvoices = await call('getInvoices');
    const afterCash = await call('getCashTransactions');
    assert.deepEqual(afterOrders.find((item) => item.id === created.id), beforeOrder);
    assert.deepEqual(afterInvoices.find((item) => item.id === invoice.id), invoice);
    assert.deepEqual(afterCash, beforeCash);

    console.log(JSON.stringify({
      ok: true,
      rejectedCancelledPayment: true,
      ledgersUnchanged: true,
      path: 'preload -> IPC invoices:addPayment -> PaymentService -> SQLite'
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
