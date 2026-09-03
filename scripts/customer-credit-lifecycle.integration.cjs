const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, ipcMain } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

const results = [];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-customer-credit-'));
const databaseDir = path.join(root, 'database');
const backupDir = path.join(root, 'backups');
let manager;

function registry() {
  return ipcMain._invokeHandlers || ipcMain._invokeHandlersMap;
}

async function call(channel, ...args) {
  const entry = registry().get(channel);
  const handler = typeof entry === 'function' ? entry : entry?.callback;
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`);
  return handler({ sender: null }, ...args);
}

async function record(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'passed' });
  } catch (error) {
    results.push({ name, status: 'failed', error: error?.message || String(error) });
    throw error;
  }
}

function insertOrderAndInvoice(db, {
  orderId, invoiceId, orderNumber, customerId, customerName, customerPhone,
  total = 100, status = 'new', paid = 0, remaining = total,
  paymentStatus = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
}) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_id, customer_name, customer_phone,
      thobe_type_name, fabric_name, fabric_color, order_date, delivery_date,
      status, total_amount, paid_amount, remaining_amount,
      measurements_json, style_details_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId, orderNumber, customerId, customerName, customerPhone,
    'Integration Thobe', 'Integration Fabric', 'كحلي', '2026-08-20', '2026-08-30',
    status, total, paid, remaining, '{}', '{}', now, now
  );
  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, order_id, customer_name, customer_phone,
      order_date, total_amount, paid_amount, remaining_amount,
      cash_received, overpayment_amount, cancellation_writeoff_amount,
      payment_status, payments_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, '[]')
  `).run(
    invoiceId, `INV-${invoiceId}`, orderId, customerName, customerPhone,
    '2026-08-20', total, paid, remaining, paymentStatus
  );
}

function expectReject(promise, pattern) {
  return promise.then(
    () => { throw new Error(`Expected rejection${pattern ? ` matching ${pattern}` : ''}`); },
    (error) => {
      const message = String(error?.message || error);
      if (message.includes('حدث خطأ غير متوقع')) return;
      if (pattern) assert.match(message, pattern);
    }
  );
}

async function main() {
  await app.whenReady();
  process.env.SAHWA_ACTOR_ID = 'integration-user';
  manager = new SahwaDatabaseManager(databaseDir, undefined, backupDir);
  const init = manager.initDatabase();
  assert.equal(init.success, true, init.error || 'database initialization failed');
  const db = manager.getRawDb();
  const customer = db.prepare('SELECT id, name, phone FROM customers ORDER BY id LIMIT 1').get();
  assert.ok(customer, 'seed customer required');
  db.prepare('INSERT INTO customers (id, name, phone, created_at, updated_at, measurements_json, style_details_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('CUS-OTHER', 'Other Customer', '0500000000', new Date().toISOString(), new Date().toISOString(), '{}', '{}');

  insertOrderAndInvoice(db, { orderId: 'ORD-SOURCE', invoiceId: 'INV-SOURCE', orderNumber: 'ORD-CC-001', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone });
  insertOrderAndInvoice(db, { orderId: 'ORD-TARGET', invoiceId: 'INV-TARGET', orderNumber: 'ORD-CC-002', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone });
  insertOrderAndInvoice(db, { orderId: 'ORD-CANCEL', invoiceId: 'INV-CANCEL', orderNumber: 'ORD-CC-003', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, status: 'cancelled' });
  insertOrderAndInvoice(db, { orderId: 'ORD-FULL', invoiceId: 'INV-FULL', orderNumber: 'ORD-CC-004', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, total: 50, paid: 50, remaining: 0, paymentStatus: 'paid' });
  insertOrderAndInvoice(db, { orderId: 'ORD-OTHER', invoiceId: 'INV-OTHER', orderNumber: 'ORD-CC-005', customerId: 'CUS-OTHER', customerName: 'Other Customer', customerPhone: '0500000000' });
  insertOrderAndInvoice(db, { orderId: 'ORD-REMAIN', invoiceId: 'INV-REMAIN', orderNumber: 'ORD-CC-006', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, total: 5 });

  registerIpcHandlers(manager);

  await record('overpayment creates created credit without extra revenue cash classification', async () => {
    assert.equal(await call('invoices:addPayment', { invoiceId: 'INV-SOURCE', amount: 120, method: 'cash', note: 'integration overpayment', paymentId: 'PAY-CC-1' }), true);
    const summary = await call('customerCredits:summary', customer.id);
    assert.equal(summary.availableBalance, 20);
    const created = db.prepare("SELECT * FROM customer_credits WHERE payment_id = 'PAY-CC-1'").get();
    assert.equal(created.entry_type, 'created');
    assert.equal(created.balance_after, 20);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE source_id = 'PAY-CC-1'").get().n, 1);
  });

  await record('apply credit to later invoice uses no cash transaction and preserves cash_received', async () => {
    const result = await call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-TARGET', amount: 10, idempotencyKey: 'APPLY-CC-1', reason: 'تسوية فاتورة لاحقة' });
    assert.equal(result.entryType, 'applied');
    assert.equal(result.method, 'customer_credit');
    assert.equal(result.amount, 10);
    const invoice = db.prepare('SELECT paid_amount, remaining_amount, cash_received, overpayment_amount, payments_json FROM invoices WHERE id = ?').get('INV-TARGET');
    assert.equal(invoice.paid_amount, 10);
    assert.equal(invoice.remaining_amount, 90);
    assert.equal(invoice.cash_received, 0);
    assert.equal(invoice.overpayment_amount, 0);
    assert.equal(JSON.parse(invoice.payments_json)[0].method, 'customer_credit');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE order_id = 'ORD-TARGET'").get().n, 0);
  });

  await record('rejects source, cancelled, completed, different-customer, balance, and target-remaining violations', async () => {
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-SOURCE', amount: 1, idempotencyKey: 'REJECT-SOURCE', reason: 'x' }), /source/);
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-CANCEL', amount: 1, idempotencyKey: 'REJECT-CANCEL', reason: 'x' }), /cancelled/);
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-FULL', amount: 1, idempotencyKey: 'REJECT-FULL', reason: 'x' }), /remaining/);
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-OTHER', amount: 1, idempotencyKey: 'REJECT-CUSTOMER', reason: 'x' }), /same customer/);
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-TARGET', amount: 1000, idempotencyKey: 'REJECT-BALANCE', reason: 'x' }), /exceeds/);
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-REMAIN', amount: 6, idempotencyKey: 'REJECT-REMAINING', reason: 'x' }), /exceeds/);
  });

  await record('cash refund creates one outflow and records backend actor/reason', async () => {
    const result = await call('customerCredits:refund', { customerId: customer.id, amount: 4, method: 'cash', idempotencyKey: 'REFUND-CASH-1', reason: 'طلب العميل', actorId: 'renderer-forged' });
    assert.equal(result.entryType, 'refunded');
    assert.equal(result.method, 'cash');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE source_id = ?").get(result.operationId).n, 1);
    const row = db.prepare("SELECT actor_id, reason, balance_after FROM customer_credits WHERE operation_id = ?").get(result.operationId);
    assert.equal(row.actor_id, 'integration-user');
    assert.equal(row.reason, 'طلب العميل');
    assert.equal(row.balance_after, 6);
  });

  await record('non-cash refund reduces liability without Cash Drawer effect', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM cash_transactions').get().n;
    const result = await call('customerCredits:refund', { customerId: customer.id, amount: 2, method: 'card', idempotencyKey: 'REFUND-CARD-1', reason: 'استرداد غير نقدي' });
    const after = db.prepare('SELECT COUNT(*) AS n FROM cash_transactions').get().n;
    assert.equal(after, before);
    assert.equal(result.method, 'card');
  });

  await record('rejects invalid refunds and missing reasons', async () => {
    await expectReject(call('customerCredits:refund', { customerId: customer.id, amount: 100, method: 'cash', idempotencyKey: 'REFUND-TOO-MUCH', reason: 'x' }), /exceeds/);
    await expectReject(call('customerCredits:refund', { customerId: customer.id, amount: 1, method: 'cash', idempotencyKey: 'REFUND-NO-REASON', reason: '' }), /reason/);
    await expectReject(call('customerCredits:refund', { customerId: customer.id, amount: 1, method: 'customer_credit', idempotencyKey: 'REFUND-BAD-METHOD', reason: 'x' }), /method/);
  });

  await record('idempotent retry returns prior result and payload mismatch is rejected', async () => {
    const retry = await call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-TARGET', amount: 10, idempotencyKey: 'APPLY-CC-1', reason: 'تسوية فاتورة لاحقة' });
    assert.equal(retry.idempotent, true);
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-TARGET', amount: 9, idempotencyKey: 'APPLY-CC-1', reason: 'تغيير' }), /idempotency/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customer_credits WHERE idempotency_key = 'APPLY-CC-1'").get().n, 1);
  });

  await record('concurrent apply cannot spend the same remaining balance twice', async () => {
    insertOrderAndInvoice(db, { orderId: 'ORD-SOURCE-2', invoiceId: 'INV-SOURCE-2', orderNumber: 'ORD-CC-007', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone });
    assert.equal(await call('invoices:addPayment', { invoiceId: 'INV-SOURCE-2', amount: 108, method: 'cash', note: 'second overpayment', paymentId: 'PAY-CC-2' }), true);
    insertOrderAndInvoice(db, { orderId: 'ORD-CONCURRENT', invoiceId: 'INV-CONCURRENT', orderNumber: 'ORD-CC-008', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, total: 6 });
    const outcomes = await Promise.allSettled([
      call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-CONCURRENT', amount: 6, idempotencyKey: 'CONCURRENT-1', reason: 'race 1' }),
      call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-CONCURRENT', amount: 6, idempotencyKey: 'CONCURRENT-2', reason: 'race 2' })
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM customer_credits WHERE target_invoice_id = 'INV-CONCURRENT'").get().total, 6);
    assert.equal(db.prepare('SELECT paid_amount, remaining_amount FROM invoices WHERE id = ?').get('INV-CONCURRENT').paid_amount, 6);
  });

  await record('rollback leaves ledger and invoice unchanged when invoice update fails', async () => {
    insertOrderAndInvoice(db, { orderId: 'ORD-ROLLBACK', invoiceId: 'INV-ROLLBACK', orderNumber: 'ORD-CC-009', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, total: 10 });
    const beforeBalance = (await call('customerCredits:summary', customer.id)).availableBalance;
    db.exec("CREATE TRIGGER fail_customer_credit_invoice BEFORE UPDATE OF paid_amount ON invoices WHEN NEW.id = 'INV-ROLLBACK' BEGIN SELECT RAISE(ABORT, 'forced invoice failure'); END");
    await expectReject(call('customerCredits:apply', { customerId: customer.id, targetInvoiceId: 'INV-ROLLBACK', amount: 3, idempotencyKey: 'ROLLBACK-INVOICE', reason: 'forced failure' }), /forced invoice failure/);
    db.exec('DROP TRIGGER fail_customer_credit_invoice');
    assert.equal((await call('customerCredits:summary', customer.id)).availableBalance, beforeBalance);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customer_credits WHERE idempotency_key = 'ROLLBACK-INVOICE'").get().n, 0);
    assert.equal(db.prepare('SELECT paid_amount FROM invoices WHERE id = ?').get('INV-ROLLBACK').paid_amount, 0);
  });

  await record('rollback leaves liability unchanged when cash ledger fails', async () => {
    const beforeBalance = (await call('customerCredits:summary', customer.id)).availableBalance;
    db.exec("CREATE TRIGGER fail_customer_credit_cash BEFORE INSERT ON cash_transactions WHEN NEW.source_type = 'customer_refund' BEGIN SELECT RAISE(ABORT, 'forced cash failure'); END");
    await expectReject(call('customerCredits:refund', { customerId: customer.id, amount: 2, method: 'cash', idempotencyKey: 'ROLLBACK-CASH', reason: 'forced cash failure' }), /forced cash failure/);
    db.exec('DROP TRIGGER fail_customer_credit_cash');
    assert.equal((await call('customerCredits:summary', customer.id)).availableBalance, beforeBalance);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customer_credits WHERE idempotency_key = 'ROLLBACK-CASH'").get().n, 0);
  });

  await record('Integrity Checker detects negative, orphan, duplicate-operation, and cash-mismatch defects', async () => {
    db.pragma('foreign_keys = OFF');
    db.exec('PRAGMA ignore_check_constraints = ON');
    db.prepare(`INSERT INTO customer_credits (
      id, customer_id, entry_type, amount, created_at, operation_id, source_entry_id,
      method, reason, occurred_at, balance_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'BAD-NEGATIVE', 'MISSING-CUSTOMER', 'applied', -1, new Date().toISOString(),
      'BAD-DUP', 'MISSING-SOURCE', 'customer_credit', 'bad data', new Date().toISOString(), -1
    );
    db.prepare(`INSERT INTO customer_credits (
      id, customer_id, entry_type, amount, created_at
    ) VALUES (?, ?, ?, ?, ?)`).run(
      'BAD-LEGACY', customer.id, 'created', 3, new Date().toISOString()
    );
    db.prepare(`INSERT INTO customer_credits (
      id, customer_id, entry_type, amount, created_at, operation_id, source_entry_id,
      method, reason, occurred_at, balance_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'BAD-ORPHAN-SOURCE', customer.id, 'applied', 1, new Date().toISOString(),
      'BAD-ORPHAN', 'MISSING-SOURCE', 'customer_credit', 'bad orphan source', new Date().toISOString(), 0
    );
    db.prepare(`INSERT INTO customer_credits (
      id, customer_id, entry_type, amount, created_at, operation_id, source_entry_id,
      method, reason, occurred_at, balance_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'BAD-DUP-1', customer.id, 'applied', 1, new Date().toISOString(),
      'BAD-DUP', 'CREDIT-PAY-CC-1', 'customer_credit', 'bad duplicate one', new Date().toISOString(), 0
    );
    db.prepare(`INSERT INTO customer_credits (
      id, customer_id, entry_type, amount, created_at, operation_id, source_entry_id,
      method, reason, occurred_at, balance_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'BAD-DUP-2', customer.id, 'applied', 1, new Date().toISOString(),
      'BAD-DUP', 'CREDIT-PAY-CC-1', 'customer_credit', 'bad duplicate two', new Date().toISOString(), 0
    );
    db.prepare(`INSERT INTO customer_credits (
      id, customer_id, entry_type, amount, created_at, operation_id,
      method, reason, occurred_at, balance_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'BAD-CASH', customer.id, 'refunded', 1, new Date().toISOString(),
      'BAD-CASH-OP', 'cash', 'missing cash', new Date().toISOString(), 0
    );
    const report = await call('system:integrityCheck');
    const codes = new Set(report.issues.map((issue) => issue.code));
    assert.ok(codes.has('ORPHAN_CUSTOMER_CREDIT_CUSTOMER'));
    assert.ok(codes.has('ORPHAN_CUSTOMER_CREDIT_SOURCE'));
    assert.ok(codes.has('DUPLICATE_CUSTOMER_CREDIT_OPERATION'));
    assert.ok(codes.has('CUSTOMER_CREDIT_CASH_MISMATCH'));
  });

  await record('Customer credit diagnostics is read-only and reports legacy exceptions', async () => {
    const before = db.prepare('SELECT COUNT(*) AS count FROM customer_credits').get().count;
    const diagnostics = await call('customerCredits:diagnostics');
    assert.ok(Array.isArray(diagnostics.customers));
    assert.ok(Array.isArray(diagnostics.legacyExceptions));
    assert.ok(Array.isArray(diagnostics.integrityWarnings));
    assert.ok(diagnostics.legacyExceptions.some((issue) => issue.recordId === 'BAD-LEGACY'));
    assert.ok(diagnostics.integrityWarnings.some((issue) => issue.code === 'INVALID_CUSTOMER_CREDIT_AMOUNT'));
    const after = db.prepare('SELECT COUNT(*) AS count FROM customer_credits').get().count;
    assert.equal(after, before);
  });

  db.exec('PRAGMA ignore_check_constraints = OFF');
  db.pragma('foreign_keys = ON');

  const summary = await call('customerCredits:summary', customer.id);
  console.log(JSON.stringify({ ok: true, results, passed: results.filter((item) => item.status === 'passed').length, failed: results.filter((item) => item.status === 'failed').length, finalSummary: summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, results, error: error?.stack || error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await manager?.close(); } catch {}
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    if (app.isReady()) await app.quit();
  });
