import { Migration } from './types';

export const migration002: Migration = {
  version: 2,
  name: 'order_references',
  up(db) {
    const notificationColumns = db.pragma('table_info(notifications)') as Array<{ name: string }>;
    if (!notificationColumns.some((column) => column.name === 'order_id')) {
      db.exec('ALTER TABLE notifications ADD COLUMN order_id TEXT');
    }
    const cashColumns = db.pragma('table_info(cash_transactions)') as Array<{ name: string }>;
    if (!cashColumns.some((column) => column.name === 'order_id')) {
      db.exec('ALTER TABLE cash_transactions ADD COLUMN order_id TEXT');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_cash_transactions_order ON cash_transactions(order_id, transaction_date, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_order ON notifications(order_id, date)');
  }
};
