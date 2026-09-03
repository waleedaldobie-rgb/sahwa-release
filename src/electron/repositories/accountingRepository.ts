import Database from 'better-sqlite3';

export class AccountingRepository {
  constructor(private readonly db: Database.Database) {}

  listPurchases(): any[] {
    return this.db.prepare('SELECT * FROM purchases ORDER BY purchase_date DESC, created_at DESC').all();
  }

  listPurchaseLines(): any[] {
    return this.db.prepare('SELECT * FROM purchase_lines ORDER BY created_at ASC').all();
  }

  findPurchase(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
  }

  insertPurchase(row: {
    id: string; supplier: string; invoiceNumber?: string; purchaseDate: string;
    totalAmount: number; paymentMethod: string; notes?: string; createdAt: string;
  }): void {
    this.db.prepare(`
      INSERT INTO purchases (id, supplier, invoice_number, purchase_date, total_amount, payment_method, notes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?)
    `).run(row.id, row.supplier, row.invoiceNumber || null, row.purchaseDate, row.totalAmount, row.paymentMethod, row.notes || null, row.createdAt);
  }

  insertPurchaseLine(row: {
    id: string; purchaseId: string; itemType: string; itemId: string; itemName: string;
    quantity: number; unit: string; unitPrice: number; totalAmount: number; createdAt: string;
  }): void {
    this.db.prepare(`
      INSERT INTO purchase_lines (id, purchase_id, item_type, item_id, item_name, quantity, unit, unit_price, total_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.purchaseId, row.itemType, row.itemId, row.itemName, row.quantity, row.unit, row.unitPrice, row.totalAmount, row.createdAt);
  }

  updatePurchasePrice(itemType: 'fabric' | 'accessory', itemId: string, price: number): void {
    const table = itemType === 'fabric' ? 'fabrics' : 'accessories';
    this.db.prepare(`UPDATE ${table} SET purchase_price = ? WHERE id = ?`).run(price, itemId);
  }

  listExpenses(): any[] {
    return this.db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC').all();
  }

  findExpense(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  }

  insertExpense(row: {
    id: string; category: string; amount: number; expenseDate: string;
    paymentMethod: string; description: string; notes?: string; createdAt: string;
  }): void {
    this.db.prepare(`
      INSERT INTO expenses (id, category, amount, expense_date, payment_method, description, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.category, row.amount, row.expenseDate, row.paymentMethod, row.description, row.notes || null, row.createdAt);
  }
}
