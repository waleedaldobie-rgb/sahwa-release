import { Migration } from './types';

export const migration008: Migration = {
  version: 8,
  name: 'unique_invoice_per_order',
  up(db) {
    const duplicateOrders = db.prepare(`
      SELECT invoices.order_id AS order_id, orders.order_number AS order_number, COUNT(*) AS count
      FROM invoices
      LEFT JOIN orders ON orders.id = invoices.order_id
      GROUP BY invoices.order_id, orders.order_number
      HAVING COUNT(*) > 1
    `).all() as Array<{ order_id: string; order_number?: string; count: number }>;
    if (duplicateOrders.length > 0) {
      const duplicateIds = db.prepare(`
        SELECT
          invoices.order_id AS order_id,
          orders.order_number AS order_number,
          invoices.id AS invoice_id,
          invoices.invoice_number AS invoice_number
        FROM invoices
        LEFT JOIN orders ON orders.id = invoices.order_id
        WHERE invoices.order_id IN (
          SELECT order_id
          FROM invoices
          GROUP BY order_id
          HAVING COUNT(*) > 1
        )
        ORDER BY invoices.order_id, invoices.id
      `).all() as Array<{
        order_id: string;
        order_number?: string;
        invoice_id: string;
        invoice_number: string;
      }>;
      const details = duplicateOrders.map((duplicate) => {
        const invoices = duplicateIds
          .filter((row) => row.order_id === duplicate.order_id)
          .map((row) => `${row.invoice_id}/${row.invoice_number}`)
          .join(', ');
        const orderLabel = duplicate.order_number ? `${duplicate.order_id}/${duplicate.order_number}` : duplicate.order_id;
        return `${orderLabel} (${duplicate.count} invoices: ${invoices})`;
      }).join('; ');
      throw new Error(`تعذر إضافة قيد فاتورة واحدة لكل طلب؛ عالج الفواتير المكررة يدوياً قبل الترقية دون حذف تلقائي: ${details}`);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_order_unique ON invoices(order_id)');
  }
};
