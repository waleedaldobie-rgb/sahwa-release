export interface DashboardSummary {
  totalOrders: number;
  revenue: number;
  lowStockCount: number;
  unreadNotifications: number;
  newCount: number;
  processingCount: number;
  readyCount: number;
  deliveredCount: number;
  cancelledCount: number;
}

interface QueryableDatabase {
  prepare: (sql: string) => { get: () => unknown };
}

function num(row: unknown, key: string): number {
  if (!row || typeof row !== 'object') return 0;
  return Number((row as Record<string, unknown>)[key] || 0);
}

export function queryDashboardSummary(db: QueryableDatabase): DashboardSummary {
  const orderStats = db.prepare(`
    SELECT
      COUNT(*) AS totalOrders,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newCount,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processingCount,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS readyCount,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS deliveredCount,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledCount
    FROM orders
  `).get();
  const revenueRow = db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS revenue FROM invoices').get();
  const lowFabrics = db.prepare(
    'SELECT COUNT(*) AS count FROM fabrics WHERE quantity_meters <= min_stock_meters'
  ).get();
  const lowAccessories = db.prepare(
    'SELECT COUNT(*) AS count FROM accessories WHERE quantity <= min_stock'
  ).get();
  const unread = db.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE read = 0 AND archived_at IS NULL'
  ).get();

  return {
    totalOrders: num(orderStats, 'totalOrders'),
    revenue: num(revenueRow, 'revenue'),
    lowStockCount: num(lowFabrics, 'count') + num(lowAccessories, 'count'),
    unreadNotifications: num(unread, 'count'),
    newCount: num(orderStats, 'newCount'),
    processingCount: num(orderStats, 'processingCount'),
    readyCount: num(orderStats, 'readyCount'),
    deliveredCount: num(orderStats, 'deliveredCount'),
    cancelledCount: num(orderStats, 'cancelledCount'),
  };
}
