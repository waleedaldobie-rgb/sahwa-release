const Database = require('better-sqlite3');

const dbPath = process.argv[2];
if (!dbPath) process.exit(2);
const db = new Database(dbPath);
try {
  db.pragma('journal_mode = WAL');
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT INTO integration_crash_probe (value) VALUES (?)').run('uncommitted-write');
  process.kill(process.pid, 'SIGKILL');
} finally {
  try { db.close(); } catch {}
}
