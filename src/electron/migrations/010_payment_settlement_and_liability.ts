import { Migration } from './types';

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const migration010: Migration = {
  version: 10,
  name: 'payment_settlement_and_customer_credit_ledger',
  up(db) {
    addColumnIfMissing(db, 'orders', 'cash_received', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'orders', 'overpayment_amount', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'orders', 'cancellation_writeoff_amount', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'invoices', 'cash_received', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'invoices', 'overpayment_amount', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'invoices', 'cancellation_writeoff_amount', 'REAL NOT NULL DEFAULT 0');

    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_credits (
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
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_credits_customer_created
        ON customer_credits(customer_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_customer_credits_source
        ON customer_credits(payment_id, entry_type);
    `);
  }
};
