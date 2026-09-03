import { describe, expect, it } from 'vitest';
// Node 22 provides a built-in SQLite implementation; use it here to keep the migration test isolated from native worker crashes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any };
import { migration011 } from '../electron/migrations/011_customer_credit_lifecycle';

type MigrationDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { get(...params: unknown[]): any; all(...params: unknown[]): any[]; run(...params: unknown[]): any };
  pragma(sql: string): any[];
  transaction<T>(callback: () => T): () => T;
  close(): void;
};

const adapt = (db: any): MigrationDatabase => ({
  exec: (sql) => db.exec(sql),
  prepare: (sql) => db.prepare(sql),
  pragma: (sql) => db.prepare(`PRAGMA ${sql}`).all(),
  transaction: (callback) => () => {
    db.exec('BEGIN');
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
  close: () => db.close()
});

describe('customer credit lifecycle migration 011', () => {
  const applyMigration = (db: MigrationDatabase) => {
    const transaction = db.transaction(() => {
      migration011.up(db as any);
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('schemaVersion', '11')").run();
    });
    transaction();
  };

  const createSchemaVersion10Database = () => {
    const raw = new DatabaseSync(':memory:');
    const db = adapt(raw);
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO system_settings (key, value) VALUES ('schemaVersion', '10');
      CREATE TABLE customers (id TEXT PRIMARY KEY);
      CREATE TABLE orders (id TEXT PRIMARY KEY);
      CREATE TABLE invoices (id TEXT PRIMARY KEY);
      CREATE TABLE customer_credits (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        order_id TEXT,
        invoice_id TEXT,
        payment_id TEXT,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('created', 'applied', 'refunded')),
        amount REAL NOT NULL CHECK (amount >= 0),
        reference_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
      INSERT INTO customers (id) VALUES ('CUS-LEGACY');
      INSERT INTO customer_credits (id, customer_id, payment_id, entry_type, amount, created_at)
      VALUES ('CREDIT-LEGACY', 'CUS-LEGACY', 'PAY-LEGACY', 'created', 20, '2026-01-01T00:00:00.000Z');
    `);
    return db;
  };

  it('upgrades schemaVersion 10 to 11 with additive columns and indexes', () => {
    const db = createSchemaVersion10Database();
    expect(db.prepare("SELECT value FROM system_settings WHERE key='schemaVersion'").get()).toMatchObject({ value: '10' });
    applyMigration(db);

    expect(db.prepare("SELECT value FROM system_settings WHERE key='schemaVersion'").get()).toMatchObject({ value: '11' });
    const columns = db.pragma('table_info(customer_credits)').map((row: any) => row.name);
    expect(columns).toEqual(expect.arrayContaining([
      'operation_id', 'idempotency_key', 'source_entry_id', 'target_invoice_id',
      'target_order_id', 'method', 'actor_id', 'reason', 'occurred_at', 'balance_after'
    ]));
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='customer_credits'").all() as Array<{ name: string }>;
    expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'idx_customer_credits_idempotency',
      'idx_customer_credits_idempotency_source',
      'idx_customer_credits_operation_entry',
      'idx_customer_credits_source_entry',
      'idx_customer_credits_target_invoice',
      'idx_customer_credits_operation_created'
    ]));
    db.close();
  });

  it('preserves row counts and leaves legacy metadata null without backfill', () => {
    const db = createSchemaVersion10Database();
    const before = {
      customers: db.prepare('SELECT COUNT(*) AS n FROM customers').get(),
      credits: db.prepare('SELECT COUNT(*) AS n FROM customer_credits').get(),
      legacy: db.prepare('SELECT id, customer_id, entry_type, amount, payment_id FROM customer_credits').get()
    };
    applyMigration(db);
    const after = {
      customers: db.prepare('SELECT COUNT(*) AS n FROM customers').get(),
      credits: db.prepare('SELECT COUNT(*) AS n FROM customer_credits').get(),
      legacy: db.prepare('SELECT id, customer_id, entry_type, amount, payment_id, operation_id, idempotency_key, balance_after FROM customer_credits').get()
    };
    expect(after.customers).toEqual(before.customers);
    expect(after.credits).toEqual(before.credits);
    expect(after.legacy).toMatchObject({ ...before.legacy, operation_id: null, idempotency_key: null, balance_after: null });
    db.close();
  });

  it('is idempotent when applied twice', () => {
    const db = createSchemaVersion10Database();
    expect(() => applyMigration(db)).not.toThrow();
    const firstColumns = db.pragma('table_info(customer_credits)').map((row: any) => row.name);
    const firstIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='customer_credits' ORDER BY name").all();
    expect(() => applyMigration(db)).not.toThrow();
    const secondColumns = db.pragma('table_info(customer_credits)').map((row: any) => row.name);
    const secondIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='customer_credits' ORDER BY name").all();
    expect(secondColumns).toEqual(firstColumns);
    expect(secondIndexes).toEqual(firstIndexes);
    expect(db.prepare('SELECT COUNT(*) AS n FROM customer_credits').get()).toEqual({ n: 1 });
    db.close();
  });
});
