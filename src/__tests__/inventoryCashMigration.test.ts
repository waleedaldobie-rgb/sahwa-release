import { describe, expect, it } from 'vitest';
// Use node:sqlite here so migration tests do not load better-sqlite3 in a Vitest worker.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any };
import { migration012 } from '../electron/migrations/012_cash_adjustment_whitelist';
import { migration013 } from '../electron/migrations/013_inventory_wac_movement_cost';
import { migration014 } from '../electron/migrations/014_notifications_lifecycle';

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

const createLegacyDatabase = () => {
  const db = adapt(new DatabaseSync(':memory:'));
  db.exec(`
    CREATE TABLE cash_transactions (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      source_type TEXT NOT NULL CHECK (source_type IN ('opening_balance', 'customer_payment', 'sale', 'purchase', 'expense', 'withdrawal', 'adjustment')),
      source_id TEXT,
      order_id TEXT,
      reference_number TEXT,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      description TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      date TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      customer_phone TEXT,
      order_id TEXT
    );
    CREATE TABLE inventory_movements (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      direction TEXT NOT NULL,
      quantity REAL NOT NULL,
      quantity_before REAL NOT NULL,
      quantity_after REAL NOT NULL,
      unit TEXT NOT NULL,
      reason TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      reference_number TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO cash_transactions VALUES ('CASH-LEGACY', 'out', 'purchase', 'PUR-LEGACY', NULL, 'P-1', 10, 'cash', '2026-01-01', 'شراء قديم', NULL, '2026-01-01T00:00:00.000Z');
    INSERT INTO notifications VALUES ('NOTIF-LEGACY', 'stock', 'قديم', 'إشعار قديم', '2026-01-01', 0, NULL, NULL);
    INSERT INTO inventory_movements VALUES ('MOV-LEGACY', 'fabric', 'FAB-1', 'قماش', 'purchase', 2, 0, 2, 'متر', 'شراء قديم', 'purchase', 'PUR-LEGACY', 'P-1', '2026-01-01T00:00:00.000Z');
  `);
  return db;
};

describe('inventory/WAC and cash hardening migrations', () => {
  it('adds audit, cost, and notification lifecycle columns while preserving legacy rows', () => {
    const db = createLegacyDatabase();
    migration012.up(db as any);
    migration013.up(db as any);
    migration014.up(db as any);
    expect(db.prepare('SELECT COUNT(*) AS n FROM cash_transactions').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM notifications').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT actor_id, reason FROM cash_transactions WHERE id = ?').get('CASH-LEGACY')).toEqual({ actor_id: null, reason: null });
    expect(db.prepare('SELECT unit_cost, total_cost, source_movement_id, actor_id FROM inventory_movements WHERE id = ?').get('MOV-LEGACY')).toEqual({ unit_cost: null, total_cost: null, source_movement_id: null, actor_id: null });
    expect(db.prepare('SELECT status, source, retry_count FROM notifications WHERE id = ?').get('NOTIF-LEGACY')).toEqual({ status: 'sent', source: 'legacy', retry_count: 0 });
    expect(db.pragma('table_info(cash_transactions)').map((row: any) => row.name)).toEqual(expect.arrayContaining(['actor_id', 'reason']));
    expect(db.pragma('table_info(inventory_movements)').map((row: any) => row.name)).toEqual(expect.arrayContaining(['unit_cost', 'total_cost', 'source_movement_id', 'actor_id']));
    expect(db.pragma('table_info(notifications)').map((row: any) => row.name)).toEqual(expect.arrayContaining(['status', 'source', 'source_id', 'read_at', 'archived_at', 'retry_count', 'last_error', 'retry_history_json', 'created_at', 'updated_at']));
    db.close();
  });

  it('is idempotent and creates all required indexes', () => {
    const db = createLegacyDatabase();
    expect(() => { migration012.up(db as any); migration013.up(db as any); migration014.up(db as any); }).not.toThrow();
    const firstColumns = {
      cash: db.pragma('table_info(cash_transactions)').map((row: any) => row.name),
      movement: db.pragma('table_info(inventory_movements)').map((row: any) => row.name),
      notifications: db.pragma('table_info(notifications)').map((row: any) => row.name)
    };
    expect(() => { migration012.up(db as any); migration013.up(db as any); migration014.up(db as any); }).not.toThrow();
    expect(db.pragma('table_info(cash_transactions)').map((row: any) => row.name)).toEqual(firstColumns.cash);
    expect(db.pragma('table_info(inventory_movements)').map((row: any) => row.name)).toEqual(firstColumns.movement);
    expect(db.pragma('table_info(notifications)').map((row: any) => row.name)).toEqual(firstColumns.notifications);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row: any) => row.name);
    expect(indexes).toEqual(expect.arrayContaining(['idx_cash_transactions_source', 'idx_inventory_movements_source_movement', 'idx_inventory_movements_cost_reference', 'idx_notifications_source_source_id', 'idx_notifications_active_created']));
    db.close();
  });
});
