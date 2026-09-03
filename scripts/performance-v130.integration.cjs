const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { app } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');

const ORDER_COUNT = Number(process.env.PERF_ORDERS || 10000);
const INVENTORY_MOVEMENT_COUNT = Number(process.env.PERF_MOVEMENTS || 50000);
const CUSTOMER_COUNT = Math.max(1000, Math.ceil(ORDER_COUNT / 10));
const ITERATIONS = 3;
const THRESHOLDS_MS = {
  dashboardLoad: 3000,
  reportsRendering: 5000,
  excelExport: 30000,
  csvExport: 15000,
  backup: 10000,
  restore: 15000,
  inventoryMovementsQuery: 5000
};

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

async function measure(label, operation, iterations = ITERATIONS) {
  const samples = [];
  let lastResult;
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    lastResult = await operation();
    samples.push(performance.now() - started);
  }
  const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return {
    label,
    iterations,
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
    averageMs: Number(averageMs.toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
    resultBytes: typeof lastResult === 'string' || Buffer.isBuffer(lastResult) ? Buffer.byteLength(lastResult) : undefined
  };
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createCsvPayload(data) {
  const rows = [
    ['order_number', 'status', 'total_amount', 'paid_amount', 'cash_received', 'overpayment', 'included_in_sales'],
    ...(data.orders || []).map((order) => [
      order.orderNumber,
      order.status,
      order.totalAmount,
      order.paidAmount,
      order.cashReceived,
      order.overpaymentAmount,
      order.status !== 'cancelled' ? 'yes' : 'no'
    ]),
    [],
    ['Customer Credit Section'],
    ['metric', 'value', 'net_profit_impact', 'cash_received_impact', 'applied_collected_impact', 'recognized_revenue_impact'],
    ['overpayment_created', 0, 0, 0, 0, 0],
    ['overpayment_applied', 0, 0, 0, 0, 0],
    ['overpayment_refunded', 0, 0, 0, 0, 0],
    ['customer_credit_cash_refunds', 0, 0, 0, 0, 0],
    ['customer_credit_non_cash_refunds', 0, 0, 0, 0, 0],
    ['closing_customer_credit_liability', 0, 0, 0, 0, 0]
  ];
  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
}

function seedFixture(db) {
  const timestamp = '2026-08-20T10:00:00.000Z';
  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, name, phone, created_at, updated_at, measurements_json, style_details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFabric = db.prepare(`
    INSERT INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAccessory = db.prepare(`
    INSERT INTO accessories (id, name, category, quantity, min_stock, unit, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_id, customer_name, customer_phone, thobe_type_name,
      fabric_id, fabric_name, fabric_color, fabric_consumption_meters, fabric_buy_price_at_order,
      garment_count, order_date, delivery_date, status, total_amount, paid_amount,
      remaining_amount, cash_received, overpayment_amount, cancellation_writeoff_amount,
      is_custom_measurement, measurements_json, style_details_json, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, order_id, customer_name, customer_phone, order_date,
      total_amount, paid_amount, remaining_amount, cash_received, overpayment_amount,
      cancellation_writeoff_amount, payment_status, payments_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCash = db.prepare(`
    INSERT INTO cash_transactions (
      id, direction, source_type, source_id, order_id, reference_number, amount,
      payment_method, transaction_date, description, notes, actor_id, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements (
      id, item_type, item_id, item_name, direction, quantity, quantity_before,
      quantity_after, unit, reason, reference_type, reference_id, reference_number,
      unit_cost, total_cost, source_movement_id, actor_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    for (let i = 1; i <= CUSTOMER_COUNT; i += 1) {
      insertCustomer.run(`PERF-CUS-${i}`, `Synthetic Customer ${i}`, `058${String(i).padStart(7, '0')}`, timestamp, timestamp, '{}', '{}');
    }
    insertFabric.run('PERF-FAB-1', 'Synthetic Fabric', 'White', '#ffffff', 40, 100, 100000, 10, timestamp);
    insertAccessory.run('PERF-ACC-1', 'Synthetic Accessory', 'Buttons', 100000, 10, 'piece', timestamp);

    for (let i = 1; i <= ORDER_COUNT; i += 1) {
      const customerNumber = ((i - 1) % CUSTOMER_COUNT) + 1;
      const customerId = `PERF-CUS-${customerNumber}`;
      const customerName = `Synthetic Customer ${customerNumber}`;
      const total = 200 + (i % 11) * 10;
      const status = i % 10 === 0 ? 'cancelled' : i % 3 === 0 ? 'delivered' : i % 3 === 1 ? 'processing' : 'new';
      const paid = status === 'cancelled' ? Math.floor(total / 3) : status === 'delivered' ? total : Math.floor(total / 2);
      const remainingBeforeSettlement = Math.max(0, total - paid);
      const cancellationWriteoff = status === 'cancelled' ? remainingBeforeSettlement : 0;
      const remaining = Math.max(0, remainingBeforeSettlement - cancellationWriteoff);
      const persistedStatus = status === 'cancelled' ? 'cancelled' : status;
      const date = `2026-${String(((i - 1) % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      const orderId = `PERF-ORD-${i}`;
      const invoiceId = `PERF-INV-${i}`;
      const paymentsJson = paid > 0 ? JSON.stringify([{
        id: `PERF-PAY-${i}`,
        invoiceId,
        orderId,
        amount: paid,
        paymentDate: date,
        method: 'cash',
        note: 'synthetic performance payment'
      }]) : '[]';
      insertOrder.run(
        orderId, `PERF-${String(i).padStart(6, '0')}`, customerId, customerName, `058${String(customerNumber).padStart(7, '0')}`,
        'Synthetic Thobe', 'PERF-FAB-1', 'Synthetic Fabric', 'White', 3.5, 40, 1, date, date, persistedStatus,
        total, paid, remaining, paid, 0, cancellationWriteoff, 0, '{}', '{}', '', `${date}T10:00:00.000Z`, `${date}T10:00:00.000Z`
      );
      insertInvoice.run(
        invoiceId, `PERF-INV-N-${String(i).padStart(6, '0')}`, orderId, customerName,
        `058${String(customerNumber).padStart(7, '0')}`, date, total, paid, remaining, paid, 0, cancellationWriteoff,
        cancellationWriteoff > 0 ? 'settled_by_cancellation' : paid === 0 ? 'unpaid' : paid < total ? 'partial' : 'paid', paymentsJson
      );
      if (paid > 0) {
        insertCash.run(
          `PERF-CASH-${i}`, 'in', 'customer_payment', `PERF-PAY-${i}`, orderId, `PERF-CASH-REF-${i}`,
          paid, 'cash', date, 'Synthetic performance customer payment', 'synthetic performance fixture', 'performance-harness', 'synthetic payment', `${date}T10:00:00.000Z`
        );
      }
    }

    let fabricBalance = 100000;
    let accessoryBalance = 100000;
    for (let i = 1; i <= INVENTORY_MOVEMENT_COUNT; i += 1) {
      const fabric = i % 2 === 0;
      const itemType = fabric ? 'fabric' : 'accessory';
      const itemId = fabric ? 'PERF-FAB-1' : 'PERF-ACC-1';
      const itemName = fabric ? 'Synthetic Fabric' : 'Synthetic Accessory';
      const unit = fabric ? 'meter' : 'piece';
      const before = fabric ? fabricBalance : accessoryBalance;
      const direction = i % 5 === 0 ? 'purchase' : i % 7 === 0 ? 'return' : 'sale';
      const quantity = direction === 'sale' ? 1 : 2;
      const after = direction === 'sale' ? before - quantity : before + quantity;
      if (fabric) fabricBalance = after; else accessoryBalance = after;
      const date = `2026-${String(((i - 1) % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}T12:00:00.000Z`;
      insertMovement.run(
        `PERF-MOV-${i}`, itemType, itemId, itemName, direction, quantity, before, after, unit,
        'synthetic performance movement', 'performance', `PERF-REF-${i}`, `PERF-REF-N-${i}`,
        fabric ? 40 : 2, quantity * (fabric ? 40 : 2), null, 'performance-harness', date
      );
    }
    const latestFabric = db.prepare("SELECT quantity_after FROM inventory_movements WHERE item_type = 'fabric' AND item_id = 'PERF-FAB-1' ORDER BY created_at DESC, rowid DESC LIMIT 1").get();
    const latestAccessory = db.prepare("SELECT quantity_after FROM inventory_movements WHERE item_type = 'accessory' AND item_id = 'PERF-ACC-1' ORDER BY created_at DESC, rowid DESC LIMIT 1").get();
    db.prepare('UPDATE fabrics SET quantity_meters = ? WHERE id = ?').run(latestFabric.quantity_after, 'PERF-FAB-1');
    db.prepare('UPDATE accessories SET quantity = ? WHERE id = ?').run(latestAccessory.quantity_after, 'PERF-ACC-1');
  });
  seed();
}

function dashboardQuery(db) {
  return {
    orders: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status <> 'cancelled'`).get(),
    invoices: db.prepare(`SELECT COALESCE(SUM(paid_amount), 0) AS applied, COALESCE(SUM(cash_received), 0) AS cash FROM invoices`).get(),
    inventory: db.prepare(`SELECT item_type, COUNT(*) AS movements, COALESCE(SUM(quantity), 0) AS quantity FROM inventory_movements GROUP BY item_type`).all(),
    credit: db.prepare(`SELECT entry_type, COALESCE(SUM(amount), 0) AS amount FROM customer_credits GROUP BY entry_type`).all()
  };
}

(async () => {
  await app.whenReady();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-v130-performance-'));
  const manager = new SahwaDatabaseManager(root, undefined, path.join(root, 'backups'));
  const evidenceDir = process.env.PERF_OUTPUT_DIR || path.join(process.cwd(), 'performance');
  fs.mkdirSync(evidenceDir, { recursive: true });

  try {
    const initialized = manager.initDatabase();
    assert.equal(initialized.success, true, initialized.error || 'database initialization failed');
    const db = manager.getRawDb();
    seedFixture(db);

    const counts = {
      customers: db.prepare('SELECT COUNT(*) AS count FROM customers').get().count,
      orders: db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,
      invoices: db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count,
      inventoryMovements: db.prepare('SELECT COUNT(*) AS count FROM inventory_movements').get().count
    };
    assert.ok(counts.orders >= 10000, `orders fixture is too small: ${counts.orders}`);
    assert.ok(counts.inventoryMovements >= 50000, `inventory fixture is too small: ${counts.inventoryMovements}`);

    const timings = {};
    timings.dashboardLoad = await measure('dashboardLoad', async () => JSON.stringify(dashboardQuery(db)));
    timings.reportsRendering = await measure('reportsRendering', async () => JSON.stringify(manager.exportFullDataAsJson(false)));
    timings.excelExport = await measure('excelExport', () => manager.generateExcelReport('2026-01-01', '2026-12-31'));
    timings.csvExport = await measure('csvExport', async () => createCsvPayload(manager.exportFullDataAsJson(false)));
    timings.backup = await measure('backup', async () => {
      const result = await manager.backupDatabase('performance');
      assert.equal(result.success, true, result.error || 'backup failed');
      return result.filePath || '';
    });
    const restorePayload = JSON.stringify(manager.exportFullDataAsJson(false));
    timings.restore = await measure('restore', async () => {
      const result = await manager.restoreFromJson(restorePayload);
      assert.equal(result.success, true, result.error || 'restore failed');
      return result.success;
    });
    timings.inventoryMovementsQuery = await measure('inventoryMovementsQuery', async () => db.prepare(`
      SELECT item_type, item_id, COUNT(*) AS movements, SUM(quantity) AS quantity
      FROM inventory_movements
      GROUP BY item_type, item_id
      ORDER BY movements DESC
    `).all());

    const warnings = Object.entries(THRESHOLDS_MS).filter(([name, threshold]) => timings[name].averageMs > threshold).map(([name, threshold]) => ({
      metric: name,
      averageMs: timings[name].averageMs,
      thresholdMs: threshold,
      message: 'Performance threshold exceeded; recorded as warning per v1.3.0 policy.'
    }));
    const report = {
      ok: true,
      policy: 'Threshold breaches are performance warnings, not failures, for v1.3.0.',
      generatedAt: new Date().toISOString(),
      dataset: { ...counts, iterations: ITERATIONS },
      thresholdsMs: THRESHOLDS_MS,
      timings,
      warnings
    };
    fs.writeFileSync(path.join(evidenceDir, 'v130-performance.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(evidenceDir, 'v130-performance.md'), [
      '# v1.3.0 Synthetic Performance Report',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      `Dataset: ${counts.orders} orders, ${counts.inventoryMovements} inventory movements; ${ITERATIONS} iterations.`,
      '',
      '| Metric | Average (ms) | Threshold (ms) | Status |',
      '|---|---:|---:|---|',
      ...Object.entries(THRESHOLDS_MS).map(([name, threshold]) => `| ${name} | ${timings[name].averageMs} | ${threshold} | ${timings[name].averageMs <= threshold ? 'PASS' : 'WARNING'} |`),
      '',
      warnings.length === 0 ? 'No performance warnings were recorded.' : `Warnings: ${warnings.length}. Threshold breaches are non-failing warnings by policy.`,
      ''
    ].join('\n'));
    console.log(JSON.stringify(report, null, 2));
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

module.exports = { createCsvPayload, percentile };
