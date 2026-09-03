const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-payment-settlement-'));
  let manager;
  let window;
  try {
    await app.whenReady();
    manager = new SahwaDatabaseManager(root, undefined, path.join(root, 'backups'));
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
    await window.loadURL('data:text/html,<html><body>payment-settlement</body></html>');
    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.error(`[renderer:${level}] ${sourceId}:${line} ${message}`);
    });
    const call = async (name, ...args) => {
      try {
        return await window.webContents.executeJavaScript(`window.electronAPI[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
      } catch (error) {
        throw new Error(`IPC ${name} failed: ${error?.message || error}`);
      }
    };

    const customer = (await call('getCustomers'))[0];
    assert.ok(customer, 'seed customer is required');

    await call('createFabric', {
      id: 'PAY-CONTRACT-FABRIC', name: 'PAY-CONTRACT-FABRIC', color: 'أبيض', colorHex: '#fff',
      purchasePrice: 10, sellingPrice: 20, quantityMeters: 100, minStockMeters: 1
    });

    const overpaidOrder = await call('createOrder', {
      id: 'PAY-CONTRACT-OVERPAID-ORDER', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
      fabricId: 'PAY-CONTRACT-FABRIC', fabricName: 'PAY-CONTRACT-FABRIC', fabricColor: 'أبيض', garmentCount: 1,
      totalAmount: 100, paidAmount: 100, cashReceived: 120, initialPaymentMethod: 'cash'
    });
    const overpaidInvoice = (await call('getInvoices')).find((invoice) => invoice.orderId === overpaidOrder.id);
    assert.ok(overpaidInvoice, 'overpaid invoice is required');
    assert.equal(overpaidInvoice.paidAmount, 100);
    assert.equal(overpaidInvoice.remainingAmount, 0);
    assert.equal(overpaidInvoice.cashReceived, 120);
    assert.equal(overpaidInvoice.overpaymentAmount, 20);
    const dataAfterOverpayment = await call('getData');
    const credit = (dataAfterOverpayment.customerCredits || []).find((entry) => entry.invoiceId === overpaidInvoice.id && entry.entryType === 'created');
    assert.ok(credit, 'customer credit audit entry is required');
    assert.equal(credit.amount, 20);
    const integrityAfterOverpayment = await call('checkDatabaseIntegrity');
    assert.equal(integrityAfterOverpayment.ok, true, JSON.stringify(integrityAfterOverpayment.issues));

    const cancelledOrder = await call('createOrder', {
      id: 'PAY-CONTRACT-CANCELLED-ORDER', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
      fabricId: 'PAY-CONTRACT-FABRIC', fabricName: 'PAY-CONTRACT-FABRIC', fabricColor: 'أبيض', garmentCount: 1,
      totalAmount: 300, paidAmount: 100, cashReceived: 100, initialPaymentMethod: 'cash'
    });
    const cashBeforeCancellation = await call('getCashTransactions');
    await call('updateOrderStatus', { orderId: cancelledOrder.id, status: 'cancelled' });

    const cancelledInvoice = (await call('getInvoices')).find((invoice) => invoice.orderId === cancelledOrder.id);
    const cancelledOrderRow = (await call('getOrders')).find((order) => order.id === cancelledOrder.id);
    assert.equal(cancelledOrderRow.status, 'cancelled');
    assert.equal(cancelledOrderRow.paidAmount, 100);
    assert.equal(cancelledOrderRow.remainingAmount, 0);
    assert.equal(cancelledOrderRow.cancellationWriteoffAmount, 200);
    assert.equal(cancelledInvoice.paymentStatus, 'settled_by_cancellation');
    assert.equal(cancelledInvoice.cancellationWriteoffAmount, 200);
    assert.equal(cancelledInvoice.remainingAmount, 0);

    const cashAfterCancellation = await call('getCashTransactions');
    assert.deepEqual(cashAfterCancellation, cashBeforeCancellation);
    assert.equal(cashAfterCancellation.filter((row) => row.orderId === cancelledOrder.id && row.direction === 'out').length, 0);

    const cancellationSnapshot = { order: cancelledOrderRow, invoice: cancelledInvoice, cash: cashAfterCancellation };
    await call('updateOrderStatus', { orderId: cancelledOrder.id, status: 'cancelled' });
    const afterIdempotentCancel = {
      order: (await call('getOrders')).find((order) => order.id === cancelledOrder.id),
      invoice: (await call('getInvoices')).find((invoice) => invoice.orderId === cancelledOrder.id),
      cash: await call('getCashTransactions')
    };
    assert.deepEqual(afterIdempotentCancel, cancellationSnapshot);

    let paymentRejected = false;
    try {
      await call('addPayment', { invoiceId: cancelledInvoice.id, amount: 10, method: 'cash', note: 'cancelled payment must reject', paymentId: 'PAY-CONTRACT-CANCELLED-PAY' });
    } catch (error) {
      paymentRejected = true;
      assert.match(String(error?.message || error), /ملغى|ملغاة|cancel/i);
    }
    assert.equal(paymentRejected, true);
    assert.deepEqual(await call('getCashTransactions'), cashAfterCancellation);

    let deleteRejected = false;
    try {
      await call('deleteOrder', cancelledOrder.id);
    } catch (error) {
      deleteRejected = true;
      assert.match(String(error?.message || error), /سجل مالي|financial|أرشفة/i);
    }
    assert.equal(deleteRejected, true, 'financial order deletion must be blocked');
    assert.ok((await call('getOrders')).some((order) => order.id === cancelledOrder.id));
    assert.deepEqual(await call('getCashTransactions'), cashAfterCancellation);

    const fullyPaidOrder = await call('createOrder', {
      id: 'PAY-CONTRACT-FULLY-PAID-ORDER', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
      fabricId: 'PAY-CONTRACT-FABRIC', fabricName: 'PAY-CONTRACT-FABRIC', fabricColor: 'أبيض', garmentCount: 1,
      totalAmount: 50, paidAmount: 50, cashReceived: 50, initialPaymentMethod: 'cash'
    });
    await call('updateOrderStatus', { orderId: fullyPaidOrder.id, status: 'cancelled' });
    const fullyPaidInvoice = (await call('getInvoices')).find((invoice) => invoice.orderId === fullyPaidOrder.id);
    assert.equal(fullyPaidInvoice.paymentStatus, 'paid');
    assert.equal(fullyPaidInvoice.cancellationWriteoffAmount, 0);

    const integrityBeforeRestore = await call('checkDatabaseIntegrity');
    assert.equal(integrityBeforeRestore.ok, true, JSON.stringify(integrityBeforeRestore.issues));
    const backupPayload = await call('getData');
    const restoreResult = await call('importBackup', JSON.stringify(backupPayload));
    assert.equal(restoreResult.success, true, restoreResult.error || 'restore failed');
    const restoredData = await call('getData');
    const restoredCredit = (restoredData.customerCredits || []).find((entry) => entry.invoiceId === overpaidInvoice.id && entry.entryType === 'created');
    assert.ok(restoredCredit, 'customer credit must survive restore');
    assert.equal(restoredCredit.amount, 20);
    const restoredCancelledInvoice = (await call('getInvoices')).find((invoice) => invoice.orderId === cancelledOrder.id);
    assert.equal(restoredCancelledInvoice.cancellationWriteoffAmount, 200);
    assert.equal(restoredCancelledInvoice.paymentStatus, 'settled_by_cancellation');
    const integrityAfterRestore = await call('checkDatabaseIntegrity');
    assert.equal(integrityAfterRestore.ok, true, JSON.stringify(integrityAfterRestore.issues));

    console.log(JSON.stringify({
      ok: true,
      initialOverpaymentLiability: 20,
      cancellationWriteoff: 200,
      cancelledPaymentRejected: paymentRejected,
      cancelledOrderDeleteRejected: deleteRejected,
      cancellationWriteoffIdempotent: true,
      noCashReversalOnCancellation: true,
      fullyPaidCancelledStatus: fullyPaidInvoice.paymentStatus,
      restorePreservedCustomerCredit: restoredCredit.amount === 20,
      restorePreservedCancellationWriteoff: restoredCancelledInvoice.cancellationWriteoffAmount === 200,
      integrityChecks: 'PASS before and after restore',
      path: 'Electron BrowserWindow -> preload -> IPC -> Production services -> SQLite'
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
