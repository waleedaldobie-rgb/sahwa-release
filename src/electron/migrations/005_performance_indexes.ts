import { Migration } from './types';

export const migration005: Migration = {
  version: 5,
  name: 'performance_indexes',
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_orders_status_delivery ON orders(status, delivery_date);
      CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON orders(customer_id, order_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON invoices(customer_phone, order_date);
      CREATE INDEX IF NOT EXISTS idx_notifications_read_date ON notifications(read, date);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at);
      CREATE INDEX IF NOT EXISTS idx_cash_transactions_source ON cash_transactions(source_type, source_id, transaction_date);
    `);
  }
};
