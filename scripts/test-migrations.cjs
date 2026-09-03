const fs = require('fs');
const os = require('os');
const path = require('path');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-migrations-test-'));
  const manager = new SahwaDatabaseManager(root);
  const init = manager.initDatabase();
  if (!init.success) throw new Error(init.error || 'database init failed');

  const db = manager.getRawDb();
  db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'schemaVersion'").run();
  manager.ensureCompatibilityMigrations();
  const versionAfterFirstRun = db.prepare("SELECT value FROM system_settings WHERE key = 'schemaVersion'").get().value;
  if (versionAfterFirstRun !== '7') throw new Error(`unexpected schema version after first run: ${versionAfterFirstRun}`);

  manager.ensureCompatibilityMigrations();
  const versionAfterSecondRun = db.prepare("SELECT value FROM system_settings WHERE key = 'schemaVersion'").get().value;
  if (versionAfterSecondRun !== '7') throw new Error(`unexpected schema version after second run: ${versionAfterSecondRun}`);

  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_order_events_created_at', 'idx_order_events_order_date', 'idx_cash_transactions_order') ORDER BY name").all();
  if (indexes.length !== 3) throw new Error(`expected 3 migration indexes, found ${indexes.length}`);
  await manager.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, versionAfterFirstRun, versionAfterSecondRun, indexes: indexes.map((row) => row.name) }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
