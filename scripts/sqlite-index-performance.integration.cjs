const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { app } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');

const ITERATIONS = 40;
const CUSTOMER_COUNT = 2000;
const ORDER_COUNT = 4000;

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function measure(statement, args = [], iterations = ITERATIONS) {
  for (let i = 0; i < 5; i += 1) statement.all(...args);

  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = process.hrtime.bigint();
    statement.all(...args);
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }

  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    iterations,
    avgMs: total / samples.length,
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    maxMs: Math.max(...samples),
  };
}

function planText(db, sql) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()
    .map((row) => row.detail)
    .join(' | ');
}

function seedFixture(db) {
  const insertCustomer = db.prepare(`
    INSERT INTO customers
      (id, name, phone, created_at, updated_at, measurements_json, style_details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_id, customer_name, customer_phone,
      thobe_type_name, fabric_name, fabric_color, garment_count,
      order_date, delivery_date, status, total_amount, paid_amount,
      remaining_amount, is_custom_measurement, measurements_json,
      style_details_json, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, order_id, customer_name, customer_phone,
      order_date, total_amount, paid_amount, remaining_amount,
      payment_status, payments_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    for (let i = 1; i <= CUSTOMER_COUNT; i += 1) {
      const customerId = `IDX-CUS-${i}`;
      const name = `عميل فهرس ${String((i * 7919) % CUSTOMER_COUNT).padStart(5, '0')}`;
      const phone = `059${String(i).padStart(7, '0')}`;
      const timestamp = `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`;
      insertCustomer.run(customerId, name, phone, timestamp, timestamp, '{}', '{}');
    }

    for (let i = 1; i <= ORDER_COUNT; i += 1) {
      const customerNumber = ((i - 1) % CUSTOMER_COUNT) + 1;
      const customerId = `IDX-CUS-${customerNumber}`;
      const customerName = `عميل فهرس ${String((customerNumber * 7919) % CUSTOMER_COUNT).padStart(5, '0')}`;
      const customerPhone = `059${String(customerNumber).padStart(7, '0')}`;
      const orderId = `IDX-ORD-${i}`;
      const orderNumber = String(700000 + i);
      const orderDate = `2026-${String(((i - 1) % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      const total = 250 + (i % 7) * 10;
      const paid = i % 3 === 0 ? total : 0;

      insertOrder.run(
        orderId,
        orderNumber,
        customerId,
        customerName,
        customerPhone,
        'ثوب اختبار الفهارس',
        'قماش اختبار الفهارس',
        'أبيض',
        1,
        orderDate,
        orderDate,
        ['new', 'processing', 'ready', 'delivered'][i % 4],
        total,
        paid,
        total - paid,
        1,
        '{}',
        '{}',
        '',
        `${orderDate}T10:00:00.000Z`,
        `${orderDate}T10:00:00.000Z`,
      );

      insertInvoice.run(
        `IDX-INV-${i}`,
        String(800000 + i),
        orderId,
        customerName,
        customerPhone,
        orderDate,
        total,
        paid,
        total - paid,
        paid === 0 ? 'unpaid' : 'paid',
        '[]',
      );
    }
  });

  seed();
}

(async () => {
  await app.whenReady();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-index-performance-'));
  const manager = new SahwaDatabaseManager(root, undefined, path.join(root, 'backups'));

  try {
    const initialized = manager.initDatabase();
    assert.equal(initialized.success, true, initialized.error || 'database initialization failed');

    const db = manager.getRawDb();
    const schemaVersion = db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('schemaVersion')?.value;
    assert.equal(schemaVersion, '7');

    seedFixture(db);

    const expectedIndexes = [
      'idx_customers_name_id',
      'idx_invoices_order_date_number',
      'idx_invoices_order_id',
    ];
    const actualIndexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name IN (?, ?, ?)
      ORDER BY name
    `).all(...expectedIndexes).map((row) => row.name);
    assert.deepEqual(actualIndexes, [...expectedIndexes].sort());

    const customerSql = 'SELECT * FROM customers ORDER BY name ASC';
    const invoiceSql = 'SELECT * FROM invoices ORDER BY order_date DESC';
    const customerPlan = planText(db, customerSql);
    const invoicePlan = planText(db, invoiceSql);

    assert.match(customerPlan, /idx_customers_name_id/);
    assert.match(invoicePlan, /idx_invoices_order_date_number/);
    assert.doesNotMatch(customerPlan, /USE TEMP B-TREE FOR ORDER BY/);
    assert.doesNotMatch(invoicePlan, /USE TEMP B-TREE FOR ORDER BY/);

    const customerTiming = measure(db.prepare(customerSql));
    const invoiceTiming = measure(db.prepare(invoiceSql));

    // Hosted Windows runners are variable; these are smoke budgets, not a hard benchmark baseline.
    assert.ok(customerTiming.p95Ms <= 25, `customers P95 exceeded 25ms: ${customerTiming.p95Ms.toFixed(3)}ms`);
    assert.ok(invoiceTiming.p95Ms <= 35, `invoices P95 exceeded 35ms: ${invoiceTiming.p95Ms.toFixed(3)}ms`);

    const integrity = db.pragma('integrity_check');
    assert.equal(integrity[0]?.integrity_check, 'ok');

    console.log(JSON.stringify({
      ok: true,
      dataset: { customers: CUSTOMER_COUNT, orders: ORDER_COUNT, invoices: ORDER_COUNT },
      schemaVersion,
      indexes: actualIndexes,
      plans: { customerPlan, invoicePlan },
      timings: { customers: customerTiming, invoices: invoiceTiming },
      integrity,
    }, null, 2));
  } finally {
    await manager.close();
    fs.rmSync(root, { recursive: true, force: true });
    await app.quit();
  }
})().catch(async (error) => {
  console.error(error.stack || error.message || String(error));
  try { await app.quit(); } catch {}
  process.exitCode = 1;
});
