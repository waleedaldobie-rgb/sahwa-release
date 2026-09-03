const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-r006-migration-'));
  const manager = new SahwaDatabaseManager(root);
  const initialized = manager.initDatabase();
  assert.equal(initialized.success, true, initialized.error || 'database initialization failed');

  try {
    const db = manager.getRawDb();
    const customer = db.prepare('SELECT id, name, phone FROM customers ORDER BY id LIMIT 1').get();
    assert.ok(customer, 'seed customer is required for the migration fixture');

    db.exec('DROP INDEX IF EXISTS idx_invoices_order_unique');
    db.prepare("UPDATE system_settings SET value = '7' WHERE key = 'schemaVersion'").run();
    db.prepare(`
      INSERT INTO orders (
        id, order_number, customer_id, customer_name, customer_phone,
        thobe_type_name, fabric_name, fabric_color, order_date, delivery_date,
        measurements_json, style_details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'R006-ORDER-1',
      'R006-0001',
      customer.id,
      customer.name,
      customer.phone,
      'R006 Thobe',
      'R006 Fabric',
      'كحلي',
      '2026-08-19',
      '2026-08-20',
      '{}',
      '{}',
      '2026-08-19T00:00:00.000Z'
    );

    const insertInvoice = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, order_id, customer_name, customer_phone, order_date,
        total_amount, paid_amount, remaining_amount, payment_status, payments_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [id, number] of [['R006-INV-1', 'R006-INV-0001'], ['R006-INV-2', 'R006-INV-0002']]) {
      insertInvoice.run(id, number, 'R006-ORDER-1', customer.name, customer.phone, '2026-08-19', 100, 0, 100, 'unpaid', '[]');
    }

    const beforeInvoices = db.prepare('SELECT id, invoice_number, order_id FROM invoices WHERE order_id = ? ORDER BY id').all('R006-ORDER-1');
    assert.equal(beforeInvoices.length, 2);
    assert.equal(db.prepare("SELECT value FROM system_settings WHERE key = 'schemaVersion'").get().value, '7');
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_invoices_order_unique'").get(), undefined);

    assert.throws(
      () => manager.ensureCompatibilityMigrations(),
      (error) => {
        assert.match(error.message, /R006-ORDER-1/);
        assert.match(error.message, /R006-0001|R006-ORDER-1/);
        assert.match(error.message, /R006-INV-1\/R006-INV-0001/);
        assert.match(error.message, /R006-INV-2\/R006-INV-0002/);
        assert.match(error.message, /دون حذف تلقائي/);
        return true;
      }
    );

    assert.equal(db.prepare("SELECT value FROM system_settings WHERE key = 'schemaVersion'").get().value, '7');
    assert.deepEqual(db.prepare('SELECT id, invoice_number, order_id FROM invoices WHERE order_id = ? ORDER BY id').all('R006-ORDER-1'), beforeInvoices);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_invoices_order_unique'").get(), undefined);

    db.prepare('DELETE FROM invoices WHERE id = ?').run('R006-INV-2');
    manager.ensureCompatibilityMigrations();
    assert.equal(db.prepare("SELECT value FROM system_settings WHERE key = 'schemaVersion'").get().value, '9');
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_invoices_order_unique'").get());
    assert.throws(
      () => db.prepare('INSERT INTO invoices (id, invoice_number, order_id, customer_name, customer_phone, order_date) VALUES (?, ?, ?, ?, ?, ?)').run(
        'R006-INV-3', 'R006-INV-0003', 'R006-ORDER-1', customer.name, customer.phone, '2026-08-19'
      ),
      /UNIQUE constraint failed/
    );

    console.log(JSON.stringify({
      ok: true,
      duplicatePreflight: 'passed',
      rollbackPreservedSchemaAndRows: true,
      cleanMigration: 'passed',
      uniqueIndexEnforced: true
    }, null, 2));
  } finally {
    await manager.close();
    fs.rmSync(root, { recursive: true, force: true });
    await app.quit();
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
