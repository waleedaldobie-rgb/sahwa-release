import Database from 'better-sqlite3';
import { OrderEvent } from '../../types';

export class OrderEventRepository {
  constructor(private readonly db: Database.Database) {}

  insert(event: OrderEvent): void {
    const duplicate = this.db.prepare('SELECT id FROM order_events WHERE id = ?').get(event.id);
    if (duplicate) return;
    this.db.prepare(`
      INSERT INTO order_events (id, order_id, event_type, title, description, from_status, to_status, actor, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.orderId,
      event.type,
      event.title,
      event.description,
      event.fromStatus || null,
      event.toStatus || null,
      event.actor || null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.createdAt
    );
  }

  list(orderId?: string): any[] {
    return orderId
      ? this.db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at DESC').all(orderId)
      : this.db.prepare('SELECT * FROM order_events ORDER BY created_at DESC').all();
  }
}
