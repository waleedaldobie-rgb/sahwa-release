const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

const normalizeInvoice = (invoice) => ({
  totalAmount: invoice.totalAmount,
  paidAmount: invoice.paidAmount,
  remainingAmount: invoice.remainingAmount,
  paymentStatus: invoice.paymentStatus,
  payments: invoice.payments.map((payment) => ({ amount: payment.amount, method: payment.method }))
});
const normalizeOrder = (order) => ({
  totalAmount: order.totalAmount,
  paidAmount: order.paidAmount,
  remainingAmount: order.remainingAmount
});
const normalizeCash = (rows, orderId) => rows
  .filter((row) => row.orderId === orderId)
  .map((row) => ({ direction: row.direction, sourceType: row.sourceType, amount: row.amount, paymentMethod: row.paymentMethod }))
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r015-contract-'));
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
    await window.loadURL('data:text/html,<html><body>R015</body></html>');
    const call = (name, ...args) => window.webContents.executeJavaScript(`window.electronAPI[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
    const customer = (await call('getCustomers'))[0];
    assert.ok(customer, 'seed customer is required');
    const base = {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      garmentCount: 1,
      totalAmount: 100,
      fabricId: null,
      fabricName: 'بدون قماش',
      fabricColor: 'أبيض'
    };

    const initial = await call('createOrder', {
      ...base,
      id: 'R015-INITIAL',
      paidAmount: 30,
      initialPaymentMethod: 'cash'
    });
    const subsequent = await call('createOrder', {
      ...base,
      id: 'R015-SUBSEQUENT',
      paidAmount: 0
    });
    const subsequentInvoice = (await call('getInvoices')).find((invoice) => invoice.orderId === subsequent.id);
    assert.ok(subsequentInvoice, 'subsequent payment invoice is required');
    await call('addPayment', { invoiceId: subsequentInvoice.id, amount: 30, method: 'cash', note: 'R015 contract payment', paymentId: 'R015-SUBSEQUENT-PAYMENT' });

    const orders = await call('getOrders');
    const invoices = await call('getInvoices');
    const cash = await call('getCashTransactions');
    const initialOrder = orders.find((order) => order.id === initial.id);
    const subsequentOrder = orders.find((order) => order.id === subsequent.id);
    const initialInvoice = invoices.find((invoice) => invoice.orderId === initial.id);
    const finalSubsequentInvoice = invoices.find((invoice) => invoice.orderId === subsequent.id);
    assert.ok(initialOrder && subsequentOrder && initialInvoice && finalSubsequentInvoice);

    const initialProjection = {
      order: normalizeOrder(initialOrder),
      invoice: normalizeInvoice(initialInvoice),
      cash: normalizeCash(cash, initial.id)
    };
    const subsequentProjection = {
      order: normalizeOrder(subsequentOrder),
      invoice: normalizeInvoice(finalSubsequentInvoice),
      cash: normalizeCash(cash, subsequent.id)
    };
    assert.deepEqual(subsequentProjection, initialProjection);
    assert.equal(initialProjection.invoice.payments.length, 1);
    assert.equal(initialProjection.cash.length, 1);
    assert.equal(initialProjection.cash[0].sourceType, 'customer_payment');
    assert.equal(initialProjection.cash[0].paymentMethod, 'cash');

    console.log(JSON.stringify({
      ok: true,
      contract: 'initial payment and subsequent PaymentService payment share ledger invariants',
      initialProjection,
      subsequentProjection,
      equivalent: true
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
