const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `sahwa-order-events-benchmark-${process.pid}`);
const scales = [1000, 10000, 50000];
const eventsPerOrder = 3;

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE order_events (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    actor TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_order_events_order_date ON order_events(order_id, created_at);
  CREATE INDEX idx_order_events_created_at ON order_events(created_at);
  CREATE INDEX idx_order_events_type ON order_events(event_type);
`;

const nowIso = (offset) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, offset)).toISOString();
const ms = (start, end) => Number(end - start) / 1e6;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function benchmark(scale) {
  const scaleDbPath = `${dbPath}-${scale}.sqlite`;
  const db = new Database(scaleDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(schema);

  const insertOrder = db.prepare('INSERT INTO orders (id, order_number, status, created_at) VALUES (?, ?, ?, ?)');
  const insertEvent = db.prepare(`
    INSERT INTO order_events (id, order_id, event_type, title, description, from_status, to_status, actor, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBatch = db.transaction((count) => {
    for (let i = 0; i < count; i += 1) {
      const orderId = `ORD-BENCH-${scale}-${i}`;
      const orderNumber = String(100000 + i);
      insertOrder.run(orderId, orderNumber, 'new', nowIso(i));
      const events = [
        ['created', 'تم إنشاء الطلب', null, 'new'],
        ['status_changed', 'تغيير الحالة إلى processing', 'new', 'processing'],
        ['status_changed', 'تغيير الحالة إلى ready', 'processing', 'ready']
      ];
      events.forEach(([type, title, fromStatus, toStatus], eventIndex) => {
        insertEvent.run(
          `EVT-BENCH-${scale}-${i}-${eventIndex}`,
          orderId,
          type,
          title,
          `حدث اختباري للطلب ${orderNumber}`,
          fromStatus,
          toStatus,
          'benchmark',
          JSON.stringify({ scale, i, eventIndex }),
          nowIso(i * eventsPerOrder + eventIndex)
        );
      });
    }
  });

  const insertStart = process.hrtime.bigint();
  insertBatch(scale);
  const insertEnd = process.hrtime.bigint();

  const listByOrder = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at DESC');
  const listLatest = db.prepare('SELECT * FROM order_events ORDER BY created_at DESC LIMIT 100');
  const countByType = db.prepare('SELECT event_type, COUNT(*) AS count FROM order_events GROUP BY event_type');
  const targetOrderId = `ORD-BENCH-${scale}-${Math.floor(scale / 2)}`;

  const pointQueries = 50;
  const orderQueryTimes = [];
  const latestQueryTimes = [];
  for (let i = 0; i < pointQueries; i += 1) {
    let start = process.hrtime.bigint();
    const orderRows = listByOrder.all(targetOrderId);
    let end = process.hrtime.bigint();
    if (orderRows.length !== eventsPerOrder) throw new Error(`Expected ${eventsPerOrder} events, got ${orderRows.length}`);
    orderQueryTimes.push(ms(start, end));

    start = process.hrtime.bigint();
    const latestRows = listLatest.all();
    end = process.hrtime.bigint();
    if (latestRows.length !== 100) throw new Error(`Expected 100 latest events, got ${latestRows.length}`);
    latestQueryTimes.push(ms(start, end));
  }

  const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at DESC').all(targetOrderId);
  const latestPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM order_events ORDER BY created_at DESC LIMIT 100').all();
  const counts = countByType.all();
  const integrity = db.pragma('integrity_check');
  const foreignKeyCheck = db.pragma('foreign_key_check');
  const result = {
    orders: scale,
    events: scale * eventsPerOrder,
    insertMs: ms(insertStart, insertEnd),
    insertOrdersPerSecond: Math.round(scale / (ms(insertStart, insertEnd) / 1000)),
    orderQueryMs: { average: Number(average(orderQueryTimes).toFixed(4)), p95: Number(percentile(orderQueryTimes, 0.95).toFixed(4)), max: Number(Math.max(...orderQueryTimes).toFixed(4)) },
    latestQueryMs: { average: Number(average(latestQueryTimes).toFixed(4)), p95: Number(percentile(latestQueryTimes, 0.95).toFixed(4)), max: Number(Math.max(...latestQueryTimes).toFixed(4)) },
    queryPlan: plan,
    latestQueryPlan: latestPlan,
    eventTypeCounts: counts,
    integrity,
    foreignKeyCheck
  };
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${scaleDbPath}${suffix}`;
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
  return result;
}

try {
  const results = scales.map(benchmark);
  const payload = { generatedAt: new Date().toISOString(), eventsPerOrder, database: 'SQLite better-sqlite3, WAL, synchronous=NORMAL', results };
  console.log(JSON.stringify(payload, null, 2));
} finally {
  for (const scale of scales) {
    for (const suffix of ['', '-wal', '-shm']) {
      const candidate = `${dbPath}-${scale}.sqlite${suffix}`;
      if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    }
  }
}
