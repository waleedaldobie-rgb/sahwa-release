const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, ipcMain } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');
const { registerIpcHandlers } = require('../dist-electron/ipcHandlers.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-customer-credit-restore-'));
const sourceDir = path.join(root, 'source');
const sourceBackupDir = path.join(root, 'source-backups');
const targetDir = path.join(root, 'target');
const targetBackupDir = path.join(root, 'target-backups');
let sourceManager;
let targetManager;
const results = [];

function registry() {
  return ipcMain._invokeHandlers || ipcMain._invokeHandlersMap;
}

async function call(channel, ...args) {
  const entry = registry().get(channel);
  const handler = typeof entry === 'function' ? entry : entry?.callback;
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`);
  return handler({ sender: null }, ...args);
}

async function check(id, description, fn) {
  try {
    await fn();
    results.push({ id, status: 'PASS', description });
  } catch (error) {
    results.push({ id, status: 'FAIL', description, detail: error?.message || String(error) });
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
    'Restore Test Thobe', 'Restore Test Fabric', 'كحلي', '2026-08-21', '2026-08-31',
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
    '2026-08-21', total, paid, remaining, paymentStatus
  );
}

function rows(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

function one(db, sql, ...params) {
  return db.prepare(sql).get(...params);
}

function rowCountSnapshot(db) {
  const tables = ['customers', 'orders', 'invoices', 'cash_transactions', 'customer_credits', 'notifications'];
  return Object.fromEntries(tables.map((table) => [table, one(db, `SELECT COUNT(*) AS count FROM ${table}`).count]));
}

function sortedById(items) {
  return [...items].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function comparableCredit(row) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    order_id: row.order_id,
    invoice_id: row.invoice_id,
    payment_id: row.payment_id,
    entry_type: row.entry_type,
    amount: row.amount,
    reference_id: row.reference_id,
    notes: row.notes,
    created_at: row.created_at,
    operation_id: row.operation_id,
    idempotency_key: row.idempotency_key,
    source_entry_id: row.source_entry_id,
    target_invoice_id: row.target_invoice_id,
    target_order_id: row.target_order_id,
    method: row.method,
    actor_id: row.actor_id,
    reason: row.reason,
    occurred_at: row.occurred_at,
    balance_after: row.balance_after
  };
}

function creditSummary(db, customerId) {
  const row = one(db, `
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'created' THEN amount ELSE 0 END), 0) AS created,
      COALESCE(SUM(CASE WHEN entry_type = 'applied' THEN amount ELSE 0 END), 0) AS applied,
      COALESCE(SUM(CASE WHEN entry_type = 'refunded' THEN amount ELSE 0 END), 0) AS refunded
    FROM customer_credits WHERE customer_id = ?
  `, customerId);
  const created = Number(row.created || 0);
  const applied = Number(row.applied || 0);
  const refunded = Number(row.refunded || 0);
  return { created, applied, refunded, available: created - applied - refunded };
}

function createNotification(db) {
  db.prepare(`
    INSERT INTO notifications (
      id, type, title, message, date, read, customer_phone, order_id,
      status, source, source_id, read_at, archived_at, retry_count,
      last_error, retry_history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'NOTIFY-RESTORE-1', 'whatsapp', 'Restore notification', 'Restore lifecycle', '2026-08-21', 1,
    '0500000000', 'ORD-RESTORE-SOURCE', 'failed', 'integration', 'NOTIFY-SOURCE-1',
    '2026-08-21T00:00:01.000Z', '2026-08-21T00:00:02.000Z', 2, 'provider failed',
    JSON.stringify([{ attempt: 1, error: 'provider failed' }, { attempt: 2, error: 'provider failed' }]),
    '2026-08-21T00:00:00.000Z', '2026-08-21T00:00:02.000Z'
  );
}

async function main() {
  await app.whenReady();
  process.env.SAHWA_ACTOR_ID = 'v130-restore-test-user';

  sourceManager = new SahwaDatabaseManager(sourceDir, undefined, sourceBackupDir);
  const sourceInit = sourceManager.initDatabase();
  assert.equal(sourceInit.success, true, sourceInit.error || 'source database initialization failed');
  const sourceDb = sourceManager.getRawDb();
  const customer = one(sourceDb, 'SELECT id, name, phone FROM customers ORDER BY id LIMIT 1');
  assert.ok(customer, 'seed customer required');

  insertOrderAndInvoice(sourceDb, {
    orderId: 'ORD-RESTORE-SOURCE', invoiceId: 'INV-RESTORE-SOURCE', orderNumber: 'ORD-V130-001',
    customerId: customer.id, customerName: customer.name, customerPhone: customer.phone
  });
  insertOrderAndInvoice(sourceDb, {
    orderId: 'ORD-RESTORE-TARGET', invoiceId: 'INV-RESTORE-TARGET', orderNumber: 'ORD-V130-002',
    customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, total: 50
  });
  sourceDb.prepare(`
    INSERT INTO customer_credits (
      id, customer_id, entry_type, amount, created_at, operation_id, idempotency_key,
      source_entry_id, target_invoice_id, target_order_id, method, actor_id, reason,
      occurred_at, balance_after
    ) VALUES (?, ?, 'created', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  `).run('LEGACY-RESTORE-1', customer.id, 1, '2026-08-20T00:00:00.000Z');
  createNotification(sourceDb);
  registerIpcHandlers(sourceManager);

  assert.equal(await call('invoices:addPayment', { invoiceId: 'INV-RESTORE-SOURCE', amount: 120, method: 'cash', note: 'v1.3 restore overpayment', paymentId: 'PAY-RESTORE-1' }), true);
  const applyResult = await call('customerCredits:apply', {
    customerId: customer.id,
    targetInvoiceId: 'INV-RESTORE-TARGET',
    amount: 10,
    idempotencyKey: 'APPLY-RESTORE-1',
    reason: 'v1.3 restore apply'
  });
  assert.equal(applyResult.method, 'customer_credit');
  const cashRefund = await call('customerCredits:refund', {
    customerId: customer.id,
    amount: 4,
    method: 'cash',
    idempotencyKey: 'REFUND-RESTORE-CASH-1',
    reason: 'v1.3 restore cash refund'
  });
  assert.equal(cashRefund.method, 'cash');
  const nonCashRefund = await call('customerCredits:refund', {
    customerId: customer.id,
    amount: 2,
    method: 'card',
    idempotencyKey: 'REFUND-RESTORE-CARD-1',
    reason: 'v1.3 restore non-cash refund'
  });
  assert.equal(nonCashRefund.method, 'card');

  await check('BR-001', 'valid backup payload exists and invalid JSON is rejected', async () => {
    const backupJson = await call('system:backup');
    const parsed = JSON.parse(backupJson);
    assert.equal(parsed.schemaVersion, 15);
    assert.ok(Array.isArray(parsed.customerCredits));
    const invalid = await sourceManager.restoreFromJson('{invalid-json');
    assert.equal(invalid.success, false);
    assert.match(invalid.error || '', /Unexpected|JSON|نسخة/);
    global.__v130BackupJson = backupJson;
  });

  const backupJson = global.__v130BackupJson;
  const sourceCredits = rows(sourceDb, 'SELECT * FROM customer_credits ORDER BY id');
  const sourceCash = rows(sourceDb, 'SELECT * FROM cash_transactions ORDER BY id');
  const sourceInvoices = rows(sourceDb, 'SELECT * FROM invoices ORDER BY id');
  const sourceNotifications = rows(sourceDb, 'SELECT * FROM notifications ORDER BY id');
  const sourceSummary = creditSummary(sourceDb, customer.id);
  const sourceCounts = rowCountSnapshot(sourceDb);

  await check('SEC-001', 'customer_credit payment without matching applied ledger is rejected', async () => {
    const candidate = JSON.parse(backupJson);
    candidate.customerCredits = candidate.customerCredits.filter((credit) => !(credit.entryType === 'applied' && credit.targetInvoiceId === 'INV-RESTORE-TARGET'));
    const result = await sourceManager.restoreFromJson(JSON.stringify(candidate));
    assert.equal(result.success, false);
    assert.match(result.error || '', /MISSING_CUSTOMER_CREDIT_LEDGER/);
  });

  await check('SEC-002', 'customer_credit payment amount mismatch is rejected', async () => {
    const candidate = JSON.parse(backupJson);
    const applied = candidate.customerCredits.find((credit) => credit.entryType === 'applied' && credit.targetInvoiceId === 'INV-RESTORE-TARGET');
    assert.ok(applied, 'applied customer credit fixture required');
    applied.amount += 1;
    const result = await sourceManager.restoreFromJson(JSON.stringify(candidate));
    assert.equal(result.success, false);
    assert.match(result.error || '', /CUSTOMER_CREDIT_PAYMENT_MISMATCH/);
  });

  for (const method of ['cash', 'card', 'transfer']) {
    await check(`SEC-003-${method}`, `${method} payment without cash ledger remains rejected`, async () => {
      const candidate = JSON.parse(backupJson);
      const invoice = candidate.invoices.find((item) => item.id === 'INV-RESTORE-SOURCE');
      const payment = invoice.payments.find((item) => item.method === 'cash');
      assert.ok(payment, 'cash payment fixture required');
      payment.method = method;
      candidate.cashTransactions = candidate.cashTransactions.filter((cash) => String(cash.sourceId) !== String(payment.id));
      const result = await sourceManager.restoreFromJson(JSON.stringify(candidate));
      assert.equal(result.success, false);
      assert.match(result.error || '', /MISSING_PAYMENT_CASH/);
    });
  }

  await check('BR-002', 'invalid restore is atomic and leaves source row counts unchanged', async () => {
    const before = rowCountSnapshot(sourceDb);
    const corrupted = JSON.parse(backupJson);
    corrupted.customers = [{ ...corrupted.customers[0], id: 'DUPLICATE-CUSTOMER' }, { ...corrupted.customers[0], id: 'DUPLICATE-CUSTOMER' }];
    const result = await sourceManager.restoreFromJson(JSON.stringify(corrupted));
    assert.equal(result.success, false);
    assert.deepEqual(rowCountSnapshot(sourceDb), before);
  });

  targetManager = new SahwaDatabaseManager(targetDir, undefined, targetBackupDir);
  const targetInit = targetManager.initDatabase();
  assert.equal(targetInit.success, true, targetInit.error || 'target database initialization failed');
  const targetDb = targetManager.getRawDb();
  const restored = await targetManager.restoreFromJson(backupJson);
  assert.equal(restored.success, true, restored.error || 'target restore failed');

  await check('BR-003', 'customer credit row IDs survive restore', async () => {
    const targetCredits = rows(targetDb, 'SELECT * FROM customer_credits ORDER BY id');
    assert.deepEqual(targetCredits.map((row) => row.id), sourceCredits.map((row) => row.id));
  });

  await check('BR-004', 'customer credit source and target references survive restore', async () => {
    const targetCredits = rows(targetDb, 'SELECT id, customer_id, order_id, invoice_id, payment_id, reference_id, target_invoice_id, target_order_id, source_entry_id FROM customer_credits ORDER BY id');
    const expected = sourceCredits.map((row) => ({ id: row.id, customer_id: row.customer_id, order_id: row.order_id, invoice_id: row.invoice_id, payment_id: row.payment_id, reference_id: row.reference_id, target_invoice_id: row.target_invoice_id, target_order_id: row.target_order_id, source_entry_id: row.source_entry_id }));
    assert.deepEqual(targetCredits, expected);
  });

  await check('BR-005', 'customer credit audit metadata survives restore', async () => {
    const targetCredits = rows(targetDb, 'SELECT * FROM customer_credits ORDER BY id');
    assert.deepEqual(targetCredits.map(comparableCredit), sourceCredits.map(comparableCredit));
  });

  await check('BR-006', 'customer credit summary is identical before and after restore', async () => {
    assert.deepEqual(creditSummary(targetDb, customer.id), sourceSummary);
  });

  await check('BR-007', 'FIFO source entries and debit linkage survive restore', async () => {
    const sourceFifo = sourceCredits.map((row) => ({ id: row.id, entry_type: row.entry_type, source_entry_id: row.source_entry_id, occurred_at: row.occurred_at }));
    const targetFifo = rows(targetDb, 'SELECT id, entry_type, source_entry_id, occurred_at FROM customer_credits ORDER BY id');
    assert.deepEqual(targetFifo, sourceFifo);
  });

  await check('BR-008', 'cash and non-cash refund effects survive restore without reclassification', async () => {
    const targetCash = rows(targetDb, 'SELECT id, direction, source_type, source_id, amount, payment_method FROM cash_transactions ORDER BY id');
    const expected = sourceCash.map((row) => ({ id: row.id, direction: row.direction, source_type: row.source_type, source_id: row.source_id, amount: row.amount, payment_method: row.payment_method }));
    assert.deepEqual(targetCash, expected);
    assert.equal(targetCash.filter((row) => row.source_type === 'customer_refund').length, 1);
  });

  await check('BR-009', 'invoice payment allocation fields and payment status survive restore', async () => {
    const targetInvoices = rows(targetDb, 'SELECT id, paid_amount, remaining_amount, cash_received, overpayment_amount, cancellation_writeoff_amount, payment_status, payments_json FROM invoices ORDER BY id');
    const expected = sourceInvoices.map((row) => ({ id: row.id, paid_amount: row.paid_amount, remaining_amount: row.remaining_amount, cash_received: row.cash_received, overpayment_amount: row.overpayment_amount, cancellation_writeoff_amount: row.cancellation_writeoff_amount, payment_status: row.payment_status, payments_json: row.payments_json }));
    assert.deepEqual(targetInvoices, expected);
  });

  await check('BR-010', 'notification lifecycle metadata survives restore', async () => {
    const targetNotifications = rows(targetDb, 'SELECT * FROM notifications ORDER BY id');
    assert.deepEqual(targetNotifications, sourceNotifications);
  });

  await check('BR-011', 'legacy nullable audit metadata remains null without backfill', async () => {
    const legacy = one(sourceDb, `SELECT * FROM customer_credits WHERE operation_id IS NULL ORDER BY id LIMIT 1`);
    assert.ok(legacy, 'legacy row fixture required');
    const restoredLegacy = one(targetDb, 'SELECT * FROM customer_credits WHERE id = ?', legacy.id);
    assert.equal(restoredLegacy.operation_id, null);
    assert.equal(restoredLegacy.balance_after, null);
  });

  await check('BR-012', 'restored schema and migration state remain current', async () => {
    assert.equal(targetManager.getSettings().schemaVersion, 15);
    assert.ok(targetDb.pragma('table_info(customer_credits)').some((column) => column.name === 'balance_after'));
    assert.ok(targetDb.pragma('table_info(notifications)').some((column) => column.name === 'retry_history_json'));
  });

  await check('BR-013', 'repeating the same restore is idempotent at row and summary level', async () => {
    const before = rowCountSnapshot(targetDb);
    const repeated = await targetManager.restoreFromJson(backupJson);
    assert.equal(repeated.success, true, repeated.error || 'repeated restore failed');
    assert.deepEqual(rowCountSnapshot(targetDb), before);
    assert.deepEqual(creditSummary(targetDb, customer.id), sourceSummary);
  });

  await check('BR-014', 'integrity check passes after restore', async () => {
    const sqliteIntegrity = targetDb.pragma('integrity_check');
    assert.equal(sqliteIntegrity[0].integrity_check, 'ok');
    const postRestore = await targetManager.restoreFromJson(backupJson);
    assert.equal(postRestore.success, true, postRestore.error || 'DatabaseIntegrityService post-restore check failed');
  });

  await check('BR-015', 'failed restore does not physically delete financial rows', async () => {
    const before = rowCountSnapshot(targetDb);
    const corrupted = JSON.parse(backupJson);
    corrupted.invoices = [{ ...corrupted.invoices[0], id: 'DUPLICATE-INVOICE' }, { ...corrupted.invoices[0], id: 'DUPLICATE-INVOICE' }];
    const result = await targetManager.restoreFromJson(JSON.stringify(corrupted));
    assert.equal(result.success, false);
    assert.deepEqual(rowCountSnapshot(targetDb), before);
  });

  const failed = results.filter((item) => item.status === 'FAIL');
  console.log(JSON.stringify({
    ok: failed.length === 0,
    results,
    sourceCounts,
    sourceSummary,
    sourceCreditRows: sortedById(sourceCredits),
    targetCreditRows: sortedById(rows(targetDb, 'SELECT * FROM customer_credits')),
    failed: failed.length
  }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, results, error: error?.stack || error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await sourceManager?.close(); } catch {}
    try { await targetManager?.close(); } catch {}
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    if (app.isReady()) await app.quit();
  });
