import { Migration } from './types';

export const migration009: Migration = {
  version: 9,
  name: 'persistent_order_number_sequence',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_number_sequence (
        name TEXT PRIMARY KEY,
        next_number INTEGER NOT NULL CHECK (next_number >= 1001)
      )
    `);
    const numericOrders = db.prepare(`SELECT order_number FROM orders WHERE order_number GLOB '[0-9]*'`).all() as Array<{ order_number: string }>;
    const maxExisting = numericOrders.reduce((max, row) => Math.max(max, Number(row.order_number) || 1000), 1000);
    db.prepare(`INSERT OR IGNORE INTO order_number_sequence (name, next_number) VALUES ('orders', ?)`).run(maxExisting + 1);
  }
};
