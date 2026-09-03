import { Migration } from './types';

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export const migration014: Migration = {
  version: 14,
  name: 'notifications_lifecycle',
  up(db) {
    addColumnIfMissing(db, 'notifications', 'status', "TEXT NOT NULL DEFAULT 'sent'");
    addColumnIfMissing(db, 'notifications', 'source', "TEXT NOT NULL DEFAULT 'legacy'");
    addColumnIfMissing(db, 'notifications', 'source_id', 'TEXT');
    addColumnIfMissing(db, 'notifications', 'read_at', 'TEXT');
    addColumnIfMissing(db, 'notifications', 'archived_at', 'TEXT');
    addColumnIfMissing(db, 'notifications', 'retry_count', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'notifications', 'last_error', 'TEXT');
    addColumnIfMissing(db, 'notifications', 'retry_history_json', "TEXT NOT NULL DEFAULT '[]'");
    addColumnIfMissing(db, 'notifications', 'created_at', 'TEXT');
    addColumnIfMissing(db, 'notifications', 'updated_at', 'TEXT');
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source_source_id
        ON notifications(source, source_id)
        WHERE source_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_notifications_active_created
        ON notifications(archived_at, created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_order
        ON notifications(order_id);
    `);
  }
};
