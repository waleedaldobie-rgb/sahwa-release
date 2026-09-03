const fs = require('fs');
const os = require('os');
const path = require('path');
const { SahwaDatabaseManager } = require('../dist-electron/db.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sahwa-userdata-test-'));
  const legacyDir = path.join(root, 'legacy-data');
  const userDataDir = path.join(root, 'user-data');
  const targetDatabaseDir = path.join(userDataDir, 'database');
  const backupDir = path.join(userDataDir, 'backups');
  fs.mkdirSync(legacyDir, { recursive: true });

  const legacyManager = new SahwaDatabaseManager(legacyDir);
  const legacyInit = legacyManager.initDatabase();
  if (!legacyInit.success) throw new Error(legacyInit.error || 'legacy init failed');
  const legacyDb = legacyManager.getRawDb();
  legacyDb.prepare(`INSERT INTO customers (id, name, phone, created_at, measurements_json, style_details_json) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('TEST-CUST-001', 'عميل اختبار النقل', '0500000000', new Date().toISOString(), '{}', '{}');
  await legacyManager.close();

  const legacyDbPath = path.join(legacyDir, 'sahwa_tailoring.db');
  if (!fs.existsSync(legacyDbPath)) throw new Error('legacy database was not created');

  const manager = new SahwaDatabaseManager(targetDatabaseDir, legacyDir, backupDir);
  const init = manager.initDatabase();
  if (!init.success) throw new Error(init.error || 'target init failed');

  const migratedDbPath = path.join(targetDatabaseDir, 'sahwa_tailoring.db');
  if (!fs.existsSync(migratedDbPath)) throw new Error('migrated database was not created');
  if (!fs.existsSync(legacyDbPath)) throw new Error('legacy database was deleted unexpectedly');

  const migratedCustomer = manager.getRawDb().prepare('SELECT name FROM customers WHERE id = ?').get('TEST-CUST-001');
  if (!migratedCustomer || migratedCustomer.name !== 'عميل اختبار النقل') throw new Error('migrated customer was not found');

  const backupResult = await manager.backupDatabase('userdata_test');
  if (!backupResult.success || !backupResult.filePath || !fs.existsSync(backupResult.filePath)) throw new Error('backup was not created');

  const exported = manager.exportFullDataAsJson();
  const restoreResult = await manager.restoreFromJson(JSON.stringify(exported));
  if (!restoreResult.success) throw new Error(restoreResult.error || 'restore failed');
  const restored = manager.getRawDb().prepare('SELECT name FROM customers WHERE id = ?').get('TEST-CUST-001');
  if (!restored || restored.name !== 'عميل اختبار النقل') throw new Error('restored customer was not found');

  const legacyPreserved = fs.existsSync(legacyDbPath);
  if (!legacyPreserved) throw new Error('legacy database was deleted unexpectedly');
  await manager.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(JSON.stringify({
    ok: true,
    migrationMessage: init.corruptedRecoveryMessage,
    migratedDatabase: migratedDbPath,
    legacyPreserved,
    backupCreated: true,
    restoreVerified: true
  }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
