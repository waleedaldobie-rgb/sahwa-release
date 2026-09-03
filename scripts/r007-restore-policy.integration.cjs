const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');

const clone = (value) => JSON.parse(JSON.stringify(value));

function addValidPaidOrder(payload) {
  const customer = payload.customers[0];
  assert.ok(customer, 'seed customer is required for R-007 fixtures');

  const order = {
    id: 'R007-ORDER-1',
    orderNumber: 'R007-0001',
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    thobeTypeId: null,
    thobeTypeName: 'R007 Thobe',
    fabricId: null,
    fabricName: 'بدون قماش',
    fabricColor: 'أبيض',
    fabricConsumptionMeters: 0,
    fabricBuyPriceAtOrder: 0,
    garmentCount: 1,
    orderDate: '2026-08-20',
    deliveryDate: '2026-08-21',
    status: 'new',
    totalAmount: 300,
    paidAmount: 100,
    remainingAmount: 200,
    isCustomMeasurement: false,
    measurements: customer.measurements,
    styleDetails: customer.styleDetails,
    notes: 'R007 fixture',
    createdAt: '2026-08-20T00:00:00.000Z'
  };
  const invoice = {
    id: 'R007-INVOICE-1',
    invoiceNumber: 'INV-R007-1',
    orderId: order.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    orderDate: order.orderDate,
    totalAmount: 300,
    paidAmount: 100,
    remainingAmount: 200,
    paymentStatus: 'partial',
    payments: [{
      id: 'R007-PAYMENT-1',
      invoiceId: 'R007-INVOICE-1',
      orderId: order.id,
      amount: 100,
      paymentDate: order.orderDate,
      method: 'cash',
      note: 'R007 fixture'
    }]
  };

  payload.orders.push(order);
  payload.invoices.push(invoice);
  payload.cashTransactions.push({
    id: 'CASH-PAY-R007-PAYMENT-1',
    direction: 'in',
    sourceType: 'customer_payment',
    sourceId: 'R007-PAYMENT-1',
    orderId: order.id,
    referenceNumber: invoice.invoiceNumber,
    amount: 100,
    paymentMethod: 'cash',
    transactionDate: order.orderDate,
    description: 'R007 fixture',
    notes: null,
    createdAt: order.createdAt
  });
  return { order, invoice };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r007-restore-'));
  const manager = new SahwaDatabaseManager(root);
  const initialized = manager.initDatabase();
  assert.equal(initialized.success, true, initialized.error || 'database initialization failed');

  try {
    const validPayload = manager.exportFullDataAsJson();
    const fixture = addValidPaidOrder(validPayload);

    const validRestore = await manager.restoreFromJson(JSON.stringify(validPayload));
    assert.deepEqual(validRestore, { success: true });

    const restoredBaseline = manager.exportFullDataAsJson();
    assert.equal(restoredBaseline.orders.find((order) => order.id === fixture.order.id)?.paidAmount, 100);
    assert.equal(restoredBaseline.invoices.find((invoice) => invoice.id === fixture.invoice.id)?.payments[0]?.amount, 100);

    const rejected = [];
    const expectRejected = async (name, mutate, expectedCodes) => {
      const candidate = clone(restoredBaseline);
      mutate(candidate);
      const result = await manager.restoreFromJson(JSON.stringify(candidate));
      assert.equal(result.success, false, `${name} should be rejected`);
      for (const code of expectedCodes) assert.ok(result.error?.includes(code), `${name} should report ${code}; got ${result.error}`);
      assert.deepEqual(manager.exportFullDataAsJson(), restoredBaseline, `${name} must preserve the previous database`);
      rejected.push({ name, expectedCodes, error: result.error });
    };

    await expectRejected(
      'invoice payment ledger drift',
      (candidate) => { candidate.invoices[0].payments[0].amount = 50; },
      ['INVOICE_PAYMENT_MISMATCH', 'ORDER_PAYMENT_PROJECTION_MISMATCH']
    );

    await expectRejected(
      'order payment projection drift',
      (candidate) => {
        candidate.orders[0].paidAmount = 50;
        candidate.orders[0].remainingAmount = 250;
      },
      ['ORDER_PAYMENT_PROJECTION_MISMATCH']
    );

    await expectRejected(
      'missing invoice for an order',
      (candidate) => { candidate.invoices = []; candidate.cashTransactions = []; },
      ['MISSING_ORDER_INVOICE']
    );

    await expectRejected(
      'missing invoice payment ledger',
      (candidate) => { delete candidate.invoices[0].payments; candidate.cashTransactions = []; },
      ['MISSING_PAYMENT_LEDGER']
    );

    await expectRejected(
      'missing customer payment cash ledger',
      (candidate) => { candidate.cashTransactions = []; },
      ['MISSING_PAYMENT_CASH']
    );

    await expectRejected(
      'customer payment cash amount drift',
      (candidate) => { candidate.cashTransactions[0].amount = 50; },
      ['PAYMENT_CASH_MISMATCH']
    );

    await expectRejected(
      'duplicate payment ledger id',
      (candidate) => {
        candidate.invoices[0].payments.push({ ...candidate.invoices[0].payments[0], amount: 1 });
        candidate.invoices[0].paidAmount = 101;
        candidate.invoices[0].remainingAmount = 199;
        candidate.orders[0].paidAmount = 101;
        candidate.orders[0].remainingAmount = 199;
        candidate.cashTransactions.push({ ...candidate.cashTransactions[0], id: 'CASH-PAY-R007-PAYMENT-1-DUP', amount: 1 });
      },
      ['INVALID_PAYMENT_LEDGER']
    );

    console.log(JSON.stringify({
      ok: true,
      accepted: ['valid paid order with invoice ledger and matching cash ledger'],
      rejected,
      databasePreservedAfterEveryRejection: true
    }, null, 2));
  } finally {
    await manager.close();
    fs.rmSync(root, { recursive: true, force: true });
    await app.quit();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
