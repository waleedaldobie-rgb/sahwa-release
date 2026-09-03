import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CREATE_TABLES_SQL, CURRENT_SCHEMA_VERSION } from '../schema';
import { MIGRATIONS } from '../migrations';
import { openDatabase } from './connection';
import { initSystemSettings } from './settingsRepository';
import { seedInitialDataIfEmpty } from './seedService';

export function migrateLegacyStorageIfNeeded(opts: {
  dbPath: string;
  backupDir: string;
  legacyDbPath?: string;
  legacyBackupDir?: string;
}): string | undefined {
  const { dbPath, backupDir, legacyDbPath, legacyBackupDir } = opts;
  if (!legacyDbPath || path.resolve(legacyDbPath) === path.resolve(dbPath) || fs.existsSync(dbPath) || !fs.existsSync(legacyDbPath)) {
    return undefined;
  }

  const migrationTag = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingPath = `${dbPath}.migration-${migrationTag}.tmp`;
  let legacyDb: Database.Database | null = null;

  try {
    legacyDb = new Database(legacyDbPath);
    legacyDb.pragma('wal_checkpoint(TRUNCATE)');
    legacyDb.close();
    legacyDb = null;

    fs.copyFileSync(legacyDbPath, stagingPath);
    const verificationDb = new Database(stagingPath, { readonly: true });
    const integrity = verificationDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
    verificationDb.close();
    if (!integrity[0] || integrity[0].integrity_check !== 'ok') {
      throw new Error('فشل التحقق من سلامة قاعدة البيانات القديمة أثناء النقل');
    }

    fs.renameSync(stagingPath, dbPath);
    if (legacyBackupDir && fs.existsSync(legacyBackupDir)) {
      for (const fileName of fs.readdirSync(legacyBackupDir)) {
        const source = path.join(legacyBackupDir, fileName);
        const target = path.join(backupDir, fileName);
        if (fs.statSync(source).isFile() && !fs.existsSync(target)) fs.copyFileSync(source, target);
      }
    }
    return `تم نقل قاعدة البيانات القديمة بأمان إلى ${dbPath}. بقيت النسخة القديمة في مكانها ولم تُحذف.`;
  } catch (error) {
    try { legacyDb?.close(); } catch { /* ignore close errors during rollback */ }
    try { if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath); } catch { /* ignore staging cleanup */ }
    throw error;
  }
}

export function recoverCorruptedDatabaseIfNeeded(dbPath: string, corruptDir: string): string | undefined {
  if (!fs.existsSync(dbPath)) return undefined;

  try {
    const checkDb = new Database(dbPath);
    checkDb.pragma('foreign_keys = ON');
    const integrityResult = checkDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const isOk = integrityResult && integrityResult.length > 0 && integrityResult[0].integrity_check === 'ok';
    checkDb.close();

    if (!isOk) {
      const timeTag = new Date().toISOString().replace(/[:.]/g, '-');
      const corruptCopyPath = path.join(corruptDir, `sahwa_corrupt_${timeTag}.db`);
      fs.copyFileSync(dbPath, corruptCopyPath);
      fs.unlinkSync(dbPath);
      return `تنبيه: تم اكتشاف تلف في ملف قاعدة البيانات السابق. تم حفظ نسخة احتياطية من الملف التالف بمسار (${corruptCopyPath}) وتم بدء قاعدة بيانات سليمة جديدة.`;
    }
    return undefined;
  } catch {
    const timeTag = new Date().toISOString().replace(/[:.]/g, '-');
    const corruptCopyPath = path.join(corruptDir, `sahwa_corrupt_${timeTag}.db`);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, corruptCopyPath);
      fs.unlinkSync(dbPath);
    }
    return `تنبيه: تعذر فتح قاعدة البيانات الحالية. تم إنشاء نسخة للطوارئ بمسار (${corruptCopyPath}) والبدء بملف جديد.`;
  }
}

export function ensureCompatibilityMigrations(db: Database.Database): void {
  const settingsColumns = db.pragma('table_info(system_settings)') as Array<{ name: string }>;
  if (settingsColumns.length === 0) throw new Error('تعذر التحقق من جدول إعدادات النظام');

  let storedVersion = Number((db.prepare('SELECT value FROM system_settings WHERE key = ?').get('schemaVersion') as { value?: string } | undefined)?.value || 0);
  for (const migration of MIGRATIONS) {
    if (migration.version <= storedVersion) continue;
    const applyMigration = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run('schemaVersion', String(migration.version));
    });
    applyMigration();
    storedVersion = migration.version;
  }

  if (storedVersion < CURRENT_SCHEMA_VERSION) {
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run('schemaVersion', String(CURRENT_SCHEMA_VERSION));
  }
}

export function openAndPrepareDatabase(dbPath: string): Database.Database {
  const db = openDatabase(dbPath);
  db.exec(CREATE_TABLES_SQL);
  ensureCompatibilityMigrations(db);
  db.pragma('optimize');
  initSystemSettings(db);
  seedInitialDataIfEmpty(db);
  return db;
}
