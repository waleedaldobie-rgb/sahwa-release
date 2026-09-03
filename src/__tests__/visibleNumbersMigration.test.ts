import { describe, expect, it } from 'vitest';
// Use node:sqlite to keep migration tests isolated from better-sqlite3 native loading.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any };
import { migration015 } from '../electron/migrations/015_visible_customer_invoice_numbers';
import { CREATE_TABLES_SQL } from '../electron/schema';

type MigrationDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { get(...params: unknown[]): any; all(...params: unknown[]): any[]; run(...params: unknown[]): any };
  pragma(sql: string): any[];
  close(): void;
};

const adapt = (raw: any): MigrationDatabase => ({
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => raw.prepare(sql),
  pragma: (sql) => raw.prepare(`PRAGMA ${sql}`).all(),
  close: () => raw.close()
});

function createSchemaVersion14Database(): MigrationDatabase {
  const db = adapt(new DatabaseSync(':memory:'));
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO system_settings (key, value) VALUES ('schemaVersion', '14');
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      measurements_json TEXT,
      style_details_json TEXT
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      order_date TEXT NOT NULL
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL,
      order_date TEXT NOT NULL
    );
    INSERT INTO customers(id, name, phone, created_at) VALUES
      ('CUST-LATE', 'متأخر', '0500000002', '2026-02-01'),
      ('CUST-EARLY', 'مبكر', '0500000001', '2026-01-01');
    INSERT INTO orders(id, order_date) VALUES
      ('ORD-LATE', '2026-02-01'),
      ('ORD-EARLY', '2026-01-01');
    INSERT INTO invoices(id, invoice_number, order_id, order_date) VALUES
      ('INV-LATE', 'INV-1002', 'ORD-LATE', '2026-02-01'),
      ('INV-EARLY', 'INV-1001', 'ORD-EARLY', '2026-01-01');
  `);
  return db;
}

describe('visible customer and invoice numbers migration 015', () => {
  it('creates visible number sequences in the current base schema for fresh databases', () => {
    const db = adapt(new DatabaseSync(':memory:'));
    db.exec(CREATE_TABLES_SQL);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'visible_number_sequences'").get()).toEqual({ name: 'visible_number_sequences' });
    expect(db.prepare('PRAGMA table_info(customers)').all().map((row: any) => row.name)).toContain('customer_number');
    expect(db.prepare('PRAGMA table_info(invoices)').all().map((row: any) => row.name)).toContain('visible_invoice_number');
    db.close();
  });

  it('upgrades schemaVersion 14 to 15 and backfills both visible sequences in deterministic order', () => {
    const db = createSchemaVersion14Database();
    expect(db.prepare("SELECT value FROM system_settings WHERE key = 'schemaVersion'").get()).toEqual({ value: '14' });

    migration015.up(db as any);
    db.prepare("UPDATE system_settings SET value = '15' WHERE key = 'schemaVersion'").run();

    expect(db.prepare("SELECT value FROM system_settings WHERE key = 'schemaVersion'").get()).toEqual({ value: '15' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM customers').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT customer_number FROM customers WHERE id = ?').get('CUST-EARLY')).toEqual({ customer_number: 1 });
    expect(db.prepare('SELECT customer_number FROM customers WHERE id = ?').get('CUST-LATE')).toEqual({ customer_number: 2 });
    expect(db.prepare('SELECT visible_invoice_number FROM invoices WHERE id = ?').get('INV-EARLY')).toEqual({ visible_invoice_number: 1 });
    expect(db.prepare('SELECT visible_invoice_number FROM invoices WHERE id = ?').get('INV-LATE')).toEqual({ visible_invoice_number: 2 });
    expect(db.prepare("SELECT next_number FROM visible_number_sequences WHERE name = 'customers'").get()).toEqual({ next_number: 3 });
    expect(db.prepare("SELECT next_number FROM visible_number_sequences WHERE name = 'invoices'").get()).toEqual({ next_number: 3 });
    expect(db.prepare('SELECT id FROM customers ORDER BY id').all()).toEqual([{ id: 'CUST-EARLY' }, { id: 'CUST-LATE' }]);
    expect(db.prepare('SELECT id FROM invoices ORDER BY id').all()).toEqual([{ id: 'INV-EARLY' }, { id: 'INV-LATE' }]);
    db.close();
  });

  it('adds required columns and unique indexes', () => {
    const db = createSchemaVersion14Database();
    migration015.up(db as any);

    expect(db.pragma('table_info(customers)').map((row: any) => row.name)).toContain('customer_number');
    expect(db.pragma('table_info(invoices)').map((row: any) => row.name)).toContain('visible_invoice_number');
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row: any) => row.name);
    expect(indexes).toEqual(expect.arrayContaining([
      'idx_customers_customer_number',
      'idx_invoices_visible_invoice_number',
      'idx_customers_created_customer_number',
      'idx_invoices_visible_number'
    ]));
    db.close();
  });

  it('is idempotent and does not alter existing visible numbers or row counts', () => {
    const db = createSchemaVersion14Database();
    migration015.up(db as any);
    const firstCustomers = db.prepare('SELECT id, customer_number FROM customers ORDER BY id').all();
    const firstInvoices = db.prepare('SELECT id, visible_invoice_number FROM invoices ORDER BY id').all();
    expect(() => migration015.up(db as any)).not.toThrow();
    expect(db.prepare('SELECT id, customer_number FROM customers ORDER BY id').all()).toEqual(firstCustomers);
    expect(db.prepare('SELECT id, visible_invoice_number FROM invoices ORDER BY id').all()).toEqual(firstInvoices);
    expect(db.prepare('SELECT COUNT(*) AS n FROM customers').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 2 });
    db.close();
  });
});
