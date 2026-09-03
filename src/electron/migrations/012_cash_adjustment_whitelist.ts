import { Migration } from './types';

const CASH_SOURCE_CHECK = "('opening_balance', 'adjustment', 'withdrawal', 'customer_payment', 'customer_refund', 'customer_credit_refund', 'purchase', 'expense', 'sale')";

function tableColumns(db: any): Set<string> {
  return new Set((db.pragma('table_info(cash_transactions)') as Array<{ name: string }>).map((column) => column.name));
}

function tableSql(db: any): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cash_transactions'").get() as { sql?: string } | undefined;
  return String(row?.sql || '');
}

function createIndexes(db: any): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_date ON cash_transactions(transaction_date, created_at);
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_source ON cash_transactions(source_type, source_id, transaction_date);
  `);
}

export const migration012: Migration = {
  version: 12,
  name: 'cash_adjustment_whitelist_and_audit_metadata',
  up(db) {
    const columns = tableColumns(db);
    const sql = tableSql(db);
    const hasAuditColumns = columns.has('actor_id') && columns.has('reason');
    const hasUpdatedSourceCheck = sql.includes('customer_refund') && sql.includes('purchase') && sql.includes('expense');

    if (hasAuditColumns && hasUpdatedSourceCheck) {
      createIndexes(db);
      return;
    }

    db.exec('ALTER TABLE cash_transactions RENAME TO cash_transactions_legacy_012');
    db.exec(`
      CREATE TABLE cash_transactions (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        source_type TEXT NOT NULL CHECK (source_type IN ${CASH_SOURCE_CHECK}),
        source_id TEXT,
        order_id TEXT,
        reference_number TEXT,
        amount REAL NOT NULL CHECK (amount >= 0),
        payment_method TEXT NOT NULL DEFAULT 'cash',
        transaction_date TEXT NOT NULL,
        description TEXT NOT NULL,
        notes TEXT,
        actor_id TEXT,
        reason TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO cash_transactions (
        id, direction, source_type, source_id, order_id, reference_number, amount,
        payment_method, transaction_date, description, notes, actor_id, reason, created_at
      )
      SELECT
        id, direction, source_type, source_id, order_id, reference_number, amount,
        payment_method, transaction_date, description, notes, NULL, NULL, created_at
      FROM cash_transactions_legacy_012;

      DROP TABLE cash_transactions_legacy_012;
    `);
    createIndexes(db);
  }
};
