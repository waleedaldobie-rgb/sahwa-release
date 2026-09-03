import Database from 'better-sqlite3';
import { NotificationItem } from '../../types';

export type NotificationStatus = NonNullable<NotificationItem['status']>;
export const MAX_NOTIFICATION_RETRIES = 3;

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  customerPhone?: string;
  orderId?: string | null;
  status: NotificationStatus;
  source: string;
  sourceId?: string | null;
  readAt?: string | null;
  archivedAt?: string | null;
  retryCount: number;
  lastError?: string | null;
  retryHistory: Array<{ attempt: number; status: string; error?: string; occurredAt: string }>;
  createdAt: string;
  updatedAt: string;
}

const parseHistory = (value: unknown): NotificationRow['retryHistory'] => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export class NotificationRepository {
  constructor(private readonly db: Database.Database) {}

  private map(row: any): NotificationRow {
    const now = new Date().toISOString();
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      date: row.date,
      read: Boolean(row.read),
      customerPhone: row.customer_phone || undefined,
      orderId: row.order_id || undefined,
      status: (['pending', 'sent', 'failed', 'retry'].includes(row.status) ? row.status : 'sent') as NotificationStatus,
      source: row.source || 'legacy',
      sourceId: row.source_id || undefined,
      readAt: row.read_at || undefined,
      archivedAt: row.archived_at || undefined,
      retryCount: Number(row.retry_count || 0),
      lastError: row.last_error || undefined,
      retryHistory: parseHistory(row.retry_history_json),
      createdAt: row.created_at || now,
      updatedAt: row.updated_at || row.created_at || now
    };
  }

  private findRawById(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  }

  private findRawBySource(source: string, sourceId?: string | null): any | undefined {
    if (!sourceId) return undefined;
    return this.db.prepare('SELECT * FROM notifications WHERE source = ? AND source_id = ? ORDER BY created_at DESC LIMIT 1').get(source, sourceId);
  }

  findById(id: string): NotificationRow | undefined {
    const row = this.findRawById(id);
    return row ? this.map(row) : undefined;
  }

  findBySource(source: string, sourceId?: string | null): NotificationRow | undefined {
    const row = this.findRawBySource(source, sourceId);
    return row ? this.map(row) : undefined;
  }

  list(includeArchived = false): NotificationRow[] {
    const rows = this.db.prepare(includeArchived
      ? 'SELECT * FROM notifications ORDER BY COALESCE(created_at, date) DESC'
      : 'SELECT * FROM notifications WHERE archived_at IS NULL ORDER BY COALESCE(created_at, date) DESC').all();
    return (rows as any[]).map((row) => this.map(row));
  }

  upsert(row: {
    id: string; type: string; title: string; message: string; date: string; read?: boolean;
    customerPhone?: string | null; orderId?: string | null; status?: NotificationStatus;
    source: string; sourceId?: string | null; readAt?: string | null; archivedAt?: string | null;
    retryCount?: number; lastError?: string | null; retryHistory?: NotificationRow['retryHistory'];
  }): NotificationRow {
    const now = new Date().toISOString();
    const existing = this.findRawById(row.id) || this.findRawBySource(row.source, row.sourceId);
    const id = existing?.id || row.id;
    const createdAt = existing?.created_at || now;
    const retryHistory = row.retryHistory || (existing ? parseHistory(existing.retry_history_json) : []);
    this.db.prepare(`
      INSERT INTO notifications (
        id, type, title, message, date, read, customer_phone, order_id,
        status, source, source_id, read_at, archived_at, retry_count, last_error,
        retry_history_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type, title = excluded.title, message = excluded.message,
        date = excluded.date, customer_phone = excluded.customer_phone, order_id = excluded.order_id,
        status = excluded.status, source = excluded.source, source_id = excluded.source_id,
        read = excluded.read, read_at = excluded.read_at, archived_at = excluded.archived_at,
        retry_count = excluded.retry_count, last_error = excluded.last_error,
        retry_history_json = excluded.retry_history_json, updated_at = excluded.updated_at
    `).run(
      id, row.type, row.title, row.message, row.date, row.read ? 1 : 0,
      row.customerPhone || null, row.orderId || null, row.status || 'pending', row.source,
      row.sourceId || null, row.readAt || null, row.archivedAt || null, row.retryCount || 0,
      row.lastError || null, JSON.stringify(retryHistory), createdAt, now
    );
    return this.findById(id)!;
  }

  /**
   * Synchronize only stock-alert notifications. This intentionally never overwrites
   * server-owned delivery/audit fields (status, retryCount, retry history, source,
   * etc.) on existing notifications. It also only deletes notifications whose IDs
   * belong to the stock-alert namespace, so a stale renderer snapshot cannot erase
   * WhatsApp/server notifications.
   */
  syncStockAlerts(notifications: NotificationItem[]): { upserted: number; removed: number } {
    const stockItems = notifications.filter((notification) =>
      notification.type === 'stock'
      && (notification.id.startsWith('NOTIF-FAB-') || notification.id.startsWith('NOTIF-ACC-'))
    );
    const desiredIds = new Set(stockItems.map((notification) => notification.id));
    const sync = this.db.transaction(() => {
      let upserted = 0;
      let removed = 0;
      const existingStock = this.db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'stock' AND (id LIKE 'NOTIF-FAB-%' OR id LIKE 'NOTIF-ACC-%')
      `).all() as Array<{ id: string }>;

      for (const notification of stockItems) {
        const existing = this.findRawById(notification.id);
        if (existing) {
          const now = new Date().toISOString();
          this.db.prepare(`
            UPDATE notifications
            SET type = 'stock', title = ?, message = ?, date = ?, read = ?,
                read_at = CASE WHEN ? = 0 THEN NULL ELSE read_at END,
                archived_at = NULL, updated_at = ?
            WHERE id = ?
          `).run(
            notification.title,
            notification.message,
            notification.date,
            notification.read ? 1 : 0,
            notification.read ? 1 : 0,
            now,
            notification.id
          );
        } else {
          this.upsert({
            id: notification.id,
            type: 'stock',
            title: notification.title,
            message: notification.message,
            date: notification.date,
            read: notification.read,
            source: 'stock-alert',
            sourceId: notification.id,
            status: 'sent',
            retryCount: 0,
            retryHistory: []
          });
        }
        upserted++;
      }

      for (const row of existingStock) {
        if (!desiredIds.has(row.id)) {
          removed += Number(this.db.prepare('DELETE FROM notifications WHERE id = ?').run(row.id).changes || 0);
        }
      }
      return { upserted, removed };
    });
    return sync();
  }

  insert(row: { id: string; type: string; title: string; message: string; date: string; read: boolean; customerPhone?: string; orderId?: string | null }): void {
    this.upsert({ ...row, source: 'legacy', status: 'sent', sourceId: row.id });
  }

  markRead(id: string): NotificationRow | undefined {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE notifications SET read = 1, read_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    return this.findById(id);
  }

  markAllRead(): number {
    const now = new Date().toISOString();
    return Number(this.db.prepare('UPDATE notifications SET read = 1, read_at = ?, updated_at = ? WHERE archived_at IS NULL AND read = 0').run(now, now).changes || 0);
  }

  archiveAll(): number {
    const now = new Date().toISOString();
    return Number(this.db.prepare('UPDATE notifications SET archived_at = ?, updated_at = ? WHERE archived_at IS NULL').run(now, now).changes || 0);
  }

  markDeliveryResult(source: string, sourceId: string, status: Extract<NotificationStatus, 'sent' | 'failed'>, error?: string, title?: string, message?: string): NotificationRow | undefined {
    const existing = this.findBySource(source, sourceId);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const history = [...existing.retryHistory, { attempt: existing.retryCount, status, error, occurredAt: now }];
    this.db.prepare(`UPDATE notifications SET status = ?, title = COALESCE(?, title), message = COALESCE(?, message), last_error = ?, retry_history_json = ?, updated_at = ? WHERE id = ?`)
      .run(status, title || null, message || null, error || null, JSON.stringify(history), now, existing.id);
    return this.findById(existing.id);
  }

  retry(id: string): NotificationRow {
    const existing = this.findById(id);
    if (!existing) throw new Error('الإشعار غير موجود');
    if (existing.retryCount >= MAX_NOTIFICATION_RETRIES) throw new Error('تم تجاوز الحد الأقصى لمحاولات إعادة الإرسال');
    const now = new Date().toISOString();
    const nextCount = existing.retryCount + 1;
    const history = [...existing.retryHistory, { attempt: nextCount, status: 'retry', occurredAt: now }];
    this.db.prepare(`UPDATE notifications SET status = 'retry', retry_count = ?, last_error = NULL, retry_history_json = ?, updated_at = ? WHERE id = ?`)
      .run(nextCount, JSON.stringify(history), now, id);
    return this.findById(id)!;
  }
}
