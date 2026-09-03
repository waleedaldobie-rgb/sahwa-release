import { describe, expect, it, vi } from 'vitest';
import { loadDataSlice } from '../application/dataSlices';
import { paginateOrders } from '../application/ordersPagination';
import { queryDashboardSummary } from '../electron/dashboard/queryDashboardSummary';
import { parseIpcInput } from '../electron/validation/parseIpc';
import { ordersListQuerySchema } from '../services/shared/ipcSchemas';

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any };

describe('phase 5 data flow - إشعارات وملخص ولوحة ترقيم', () => {
  it('يحمّل شريحة الإشعارات عبر notifications:list دون data:get', async () => {
    const listed = [{ id: 'N-1', type: 'stock', title: 'تنبيه', message: 'مخزون', date: '2026-09-02', read: false }];
    const api = {
      getData: vi.fn(async () => ({ notifications: [{ id: 'STALE' }] })),
      notifications: {
        list: vi.fn(async () => listed),
      },
    };

    const patch = await loadDataSlice('notifications', api as never);

    expect(api.notifications.list).toHaveBeenCalledTimes(1);
    expect(api.getData).not.toHaveBeenCalled();
    expect(patch.notifications).toEqual(listed);
  });

  it('يعيد الطلبات كاملة عند عدم تمرير page ويُرجع items/total عند الترقيم', () => {
    const orders = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(paginateOrders(orders)).toEqual(orders);
    expect(paginateOrders(orders, undefined)).toEqual(orders);
    expect(paginateOrders(orders, { page: 2, limit: 1 })).toEqual({ items: [{ id: '2' }], total: 3 });
  });

  it('يقبل استعلام الترقيم الاختياري دون كسر الشكل الحالي', () => {
    expect(parseIpcInput(ordersListQuerySchema, undefined, 'قائمة الطلبات')).toEqual({});
    expect(parseIpcInput(ordersListQuerySchema, { page: 1, limit: 20 }, 'قائمة الطلبات')).toEqual({ page: 1, limit: 20 });
  });

  it('يجمع ملخص لوحة التحكم من استعلامات مجمعة', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        total_amount REAL NOT NULL,
        paid_amount REAL NOT NULL,
        cancellation_writeoff_amount REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE invoices (
        id TEXT PRIMARY KEY,
        paid_amount REAL NOT NULL
      );
      CREATE TABLE fabrics (
        id TEXT PRIMARY KEY,
        quantity_meters REAL NOT NULL,
        min_stock_meters REAL NOT NULL
      );
      CREATE TABLE accessories (
        id TEXT PRIMARY KEY,
        quantity REAL NOT NULL,
        min_stock REAL NOT NULL
      );
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        read INTEGER NOT NULL,
        archived_at TEXT
      );
      INSERT INTO orders VALUES
        ('o1', 'new', 100, 40, 0),
        ('o2', 'ready', 200, 200, 0),
        ('o3', 'cancelled', 50, 0, 10);
      INSERT INTO invoices VALUES ('i1', 40), ('i2', 200);
      INSERT INTO fabrics VALUES ('f1', 1, 5), ('f2', 20, 5);
      INSERT INTO accessories VALUES ('a1', 0, 2);
      INSERT INTO notifications VALUES ('n1', 0, NULL), ('n2', 1, NULL), ('n3', 0, '2026-01-01');
    `);

    const summary = queryDashboardSummary(db);
    expect(summary.totalOrders).toBe(3);
    expect(summary.revenue).toBe(240);
    expect(summary.lowStockCount).toBe(2);
    expect(summary.unreadNotifications).toBe(1);
    expect(summary.newCount).toBe(1);
    expect(summary.readyCount).toBe(1);
    expect(summary.cancelledCount).toBe(1);
    db.close();
  });
});
