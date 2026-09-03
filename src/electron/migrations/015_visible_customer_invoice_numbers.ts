import { Migration } from './types';

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function upsertNextNumber(db: any, sequenceName: string, nextNumber: number): void {
  db.prepare(`
    INSERT INTO visible_number_sequences (name, next_number)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET
      next_number = MAX(visible_number_sequences.next_number, excluded.next_number)
  `).run(sequenceName, nextNumber);
}

export const migration015: Migration = {
  version: 15,
  name: 'visible_customer_and_invoice_numbers',
  up(db) {
    addColumnIfMissing(
      db,
      'customers',
      'customer_number',
      'INTEGER CHECK (customer_number IS NULL OR customer_number >= 1)',
    );
    addColumnIfMissing(
      db,
      'invoices',
      'visible_invoice_number',
      'INTEGER CHECK (visible_invoice_number IS NULL OR visible_invoice_number >= 1)',
    );

    db.exec(`
      CREATE TABLE IF NOT EXISTS visible_number_sequences (
        name TEXT PRIMARY KEY,
        next_number INTEGER NOT NULL CHECK (next_number >= 1)
      );
    `);

    const maxCustomerRow = db.prepare(`
      SELECT COALESCE(MAX(customer_number), 0) AS max_number
      FROM customers
    `).get() as { max_number: number };
    let nextCustomerNumber = Number(maxCustomerRow?.max_number || 0) + 1;
    const customersWithoutNumber = db.prepare(`
      SELECT id
      FROM customers
      WHERE customer_number IS NULL
      ORDER BY created_at ASC, id ASC
    `).all() as Array<{ id: string }>;
    const setCustomerNumber = db.prepare(`
      UPDATE customers
      SET customer_number = ?
      WHERE id = ? AND customer_number IS NULL
    `);
    for (const customer of customersWithoutNumber) {
      setCustomerNumber.run(nextCustomerNumber++, customer.id);
    }
    const finalCustomerMax = db.prepare(`
      SELECT COALESCE(MAX(customer_number), 0) AS max_number
      FROM customers
    `).get() as { max_number: number };
    upsertNextNumber(db, 'customers', Number(finalCustomerMax?.max_number || 0) + 1);

    const maxInvoiceRow = db.prepare(`
      SELECT COALESCE(MAX(visible_invoice_number), 0) AS max_number
      FROM invoices
    `).get() as { max_number: number };
    let nextInvoiceNumber = Number(maxInvoiceRow?.max_number || 0) + 1;
    const invoicesWithoutNumber = db.prepare(`
      SELECT i.id
      FROM invoices i
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.visible_invoice_number IS NULL
      ORDER BY COALESCE(o.order_date, i.order_date) ASC, i.id ASC
    `).all() as Array<{ id: string }>;
    const setInvoiceNumber = db.prepare(`
      UPDATE invoices
      SET visible_invoice_number = ?
      WHERE id = ? AND visible_invoice_number IS NULL
    `);
    for (const invoice of invoicesWithoutNumber) {
      setInvoiceNumber.run(nextInvoiceNumber++, invoice.id);
    }
    const finalInvoiceMax = db.prepare(`
      SELECT COALESCE(MAX(visible_invoice_number), 0) AS max_number
      FROM invoices
    `).get() as { max_number: number };
    upsertNextNumber(db, 'invoices', Number(finalInvoiceMax?.max_number || 0) + 1);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_customer_number
        ON customers(customer_number);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_visible_invoice_number
        ON invoices(visible_invoice_number);
      CREATE INDEX IF NOT EXISTS idx_customers_created_customer_number
        ON customers(created_at, customer_number);
      CREATE INDEX IF NOT EXISTS idx_invoices_visible_number
        ON invoices(visible_invoice_number);
    `);
  },
};
