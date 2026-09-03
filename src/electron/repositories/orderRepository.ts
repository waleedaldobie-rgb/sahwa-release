import Database from 'better-sqlite3';

export class OrderRepository {
  constructor(private readonly db: Database.Database) {}

  list(): any[] {
    return this.db.prepare('SELECT * FROM orders ORDER BY order_date DESC, created_at DESC').all();
  }

  listPage(page: number, limit: number): any[] {
    const offset = (page - 1) * limit;
    return this.db.prepare('SELECT * FROM orders ORDER BY order_date DESC, created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  }

  listMaterialUsages(orderId?: string): any[] {
    return orderId
      ? this.db.prepare('SELECT * FROM order_material_usages WHERE order_id = ? ORDER BY created_at ASC').all(orderId)
      : this.db.prepare('SELECT * FROM order_material_usages ORDER BY created_at ASC').all();
  }

  findById(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  }

  findByOrderNumber(orderNumber: string): any | undefined {
    return this.db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
  }

  nextOrderNumber(): string {
    let candidate = Number((this.db.prepare(`
      INSERT INTO order_number_sequence (name, next_number)
      VALUES ('orders', 1002)
      ON CONFLICT(name) DO UPDATE SET next_number = order_number_sequence.next_number + 1
      RETURNING next_number - 1 AS allocated_number
    `).get() as { allocated_number: number }).allocated_number);
    while (this.findByOrderNumber(String(candidate))) {
      candidate = Number((this.db.prepare(`
        UPDATE order_number_sequence
        SET next_number = next_number + 1
        WHERE name = 'orders'
        RETURNING next_number - 1 AS allocated_number
      `).get() as { allocated_number: number }).allocated_number);
    }
    return String(candidate);
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count || 0);
  }
}
