import { Migration } from './types';

export const migration006: Migration = {
  version: 6,
  name: 'list_order_indexes',
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customers_name_id
        ON customers(name ASC, id ASC);

      CREATE INDEX IF NOT EXISTS idx_invoices_order_date_number
        ON invoices(order_date DESC, invoice_number DESC);

      CREATE INDEX IF NOT EXISTS idx_invoices_order_id
        ON invoices(order_id);
    `);
  }
};
