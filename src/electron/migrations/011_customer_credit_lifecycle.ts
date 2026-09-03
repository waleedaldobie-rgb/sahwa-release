import { Migration } from './types';

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const migration011: Migration = {
  version: 11,
  name: 'customer_credit_lifecycle_audit_and_idempotency',
  up(db) {
    // New columns are nullable so legacy rows remain untouched and unbackfilled.
    addColumnIfMissing(db, 'customer_credits', 'operation_id', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'idempotency_key', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'source_entry_id', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'target_invoice_id', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'target_order_id', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'method', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'actor_id', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'reason', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'occurred_at', 'TEXT');
    addColumnIfMissing(db, 'customer_credits', 'balance_after', 'REAL');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customer_credits_idempotency
        ON customer_credits(idempotency_key);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_credits_idempotency_source
        ON customer_credits(idempotency_key, source_entry_id)
        WHERE idempotency_key IS NOT NULL AND source_entry_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_credits_operation_entry
        ON customer_credits(operation_id, id)
        WHERE operation_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_customer_credits_source_entry
        ON customer_credits(source_entry_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_customer_credits_target_invoice
        ON customer_credits(target_invoice_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_customer_credits_operation_created
        ON customer_credits(operation_id, created_at);
    `);
  }
};
