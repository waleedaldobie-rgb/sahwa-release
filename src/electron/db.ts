import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseSettings } from './schema';
import { NotificationItem, UserPreferences } from '../types';
import { NotificationRepository } from './repositories/notificationRepository';
import { migrateLegacyStorageIfNeeded, recoverCorruptedDatabaseIfNeeded, openAndPrepareDatabase } from './database/bootstrap';
import { openDatabase } from './database/connection';
import { getSettings, updateSetting as updateSettingRecord, writeSetting, getUserPreferences, updateUserPreferences } from './database/settingsRepository';
import { performBackup } from './database/backupService';
import { restoreFromJson } from './database/restoreService';
import { exportFullDataAsJson, generateExcelReport } from './database/exportService';

export { openDatabase };

export class SahwaDatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  private backupDir: string;
  private corruptDir: string;
  private legacyDbPath?: string;
  private legacyBackupDir?: string;
  private autoBackupTimer: NodeJS.Timeout | null = null;
  private closePromise: Promise<void> | null = null;
  private backupQueue: Promise<void> = Promise.resolve();

  constructor(customDir?: string, legacyDir?: string, customBackupDir?: string) {
    const baseDir = customDir || path.join(process.cwd(), 'data');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    this.dbPath = path.join(baseDir, 'sahwa_tailoring.db');
    this.backupDir = customBackupDir || path.join(baseDir, 'backups');
    this.corruptDir = path.join(baseDir, 'corrupt_backups');
    this.legacyDbPath = legacyDir ? path.join(legacyDir, 'sahwa_tailoring.db') : undefined;
    this.legacyBackupDir = legacyDir ? path.join(legacyDir, 'backups') : undefined;

    if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
    if (!fs.existsSync(this.corruptDir)) fs.mkdirSync(this.corruptDir, { recursive: true });
  }

  public initDatabase(): { success: boolean; corruptedRecoveryMessage?: string; error?: string } {
    let corruptedRecoveryMessage: string | undefined;

    try {
      corruptedRecoveryMessage = migrateLegacyStorageIfNeeded({
        dbPath: this.dbPath,
        backupDir: this.backupDir,
        legacyDbPath: this.legacyDbPath,
        legacyBackupDir: this.legacyBackupDir,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر نقل قاعدة البيانات القديمة إلى مجلد بيانات المستخدم';
      return { success: false, error: message || 'تعذر نقل قاعدة البيانات القديمة إلى مجلد بيانات المستخدم' };
    }

    const recovered = recoverCorruptedDatabaseIfNeeded(this.dbPath, this.corruptDir);
    if (recovered) corruptedRecoveryMessage = recovered;

    try {
      this.db = openAndPrepareDatabase(this.dbPath);

      this.backupDatabase('startup_auto').catch(err => {
        console.error('Error in startup backup:', err);
      });
      this.startPeriodicAutoBackup();

      return { success: true, corruptedRecoveryMessage };
    } catch (error: unknown) {
      console.error('Failed to initialize Sahwa Database:', error);
      const message = error instanceof Error ? error.message : 'تعذر تشغيل قاعدة البيانات';
      return { success: false, error: message || 'تعذر تشغيل قاعدة البيانات' };
    }
  }

  public getRawDb(): Database.Database {
    if (!this.db) {
      throw new Error('قاعدة البيانات غير مفعلة');
    }
    return this.db;
  }

  public getSettings(): DatabaseSettings {
    return getSettings(this.getRawDb());
  }

  public updateSetting(key: keyof DatabaseSettings | 'dataCleared', value: string | number): void {
    updateSettingRecord(this.getRawDb(), key, value);
    if (key === 'autoBackupIntervalHours') {
      this.startPeriodicAutoBackup();
    }
  }

  private writeSetting(key: string, value: string | number): void {
    writeSetting(this.getRawDb(), key, value);
  }

  public getUserPreferences(): UserPreferences {
    return getUserPreferences(this.getRawDb());
  }

  public updateUserPreferences(preferences: Partial<UserPreferences>): boolean {
    return updateUserPreferences(this.getRawDb(), preferences);
  }

  public replaceNotifications(notifications: NotificationItem[]): boolean {
    new NotificationRepository(this.getRawDb()).syncStockAlerts(notifications);
    return true;
  }

  public backupDatabase(reason: string = 'auto'): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const backupRun = this.backupQueue.then(() => performBackup({
      getRawDb: () => this.getRawDb(),
      getSettings: () => this.getSettings(),
      writeSetting: (key, value) => this.writeSetting(key, value),
      exportFullDataAsJson: () => this.exportFullDataAsJson(),
      backupDir: this.backupDir,
    }, reason));
    this.backupQueue = backupRun.then(() => undefined, () => undefined);
    return backupRun;
  }

  private startPeriodicAutoBackup(): void {
    if (this.autoBackupTimer) clearInterval(this.autoBackupTimer);

    const intervalHours = Number(this.getSettings().autoBackupIntervalHours);
    const intervalMs = Number.isFinite(intervalHours) && intervalHours > 0
      ? intervalHours * 60 * 60 * 1000
      : 60 * 60 * 1000;
    this.autoBackupTimer = setInterval(() => {
      this.backupDatabase('periodic_auto').catch(err => {
        console.error('Error in periodic auto backup:', err);
      });
    }, intervalMs);
  }

  public async clearAllData(): Promise<boolean> {
    try {
      await this.backupDatabase('pre_clear');
      const db = this.getRawDb();
      const clearTx = db.transaction(() => {
        for (const table of [
          'order_events', 'order_material_usages', 'purchase_lines', 'cash_transactions',
          'expenses', 'purchases', 'inventory_movements', 'invoices', 'orders',
          'customer_credits', 'customer_measurement_history', 'customers', 'fabrics', 'accessories'
        ]) {
          db.prepare(`DELETE FROM ${table}`).run();
        }
        const archivedAt = new Date().toISOString();
        db.prepare('UPDATE notifications SET archived_at = ?, updated_at = ? WHERE archived_at IS NULL').run(archivedAt, archivedAt);
      });
      clearTx();
      this.writeSetting('dataCleared', 'true');
      return true;
    } catch (error) {
      console.error('Clear data error:', error);
      return false;
    }
  }

  public async restoreFromJson(jsonString: string): Promise<{ success: boolean; error?: string }> {
    return restoreFromJson({
      getRawDb: () => this.getRawDb(),
      backupDatabase: (reason) => this.backupDatabase(reason),
    }, jsonString);
  }

  public exportFullDataAsJson(includeArchivedNotifications = true): Record<string, unknown> {
    return exportFullDataAsJson(this.getRawDb(), includeArchivedNotifications);
  }

  public async generateExcelReport(startDate?: string, endDate?: string): Promise<Buffer> {
    return generateExcelReport(this.getRawDb(), startDate, endDate);
  }

  public async close(): Promise<void> {
    if (this.closePromise !== null) return await this.closePromise;

    this.closePromise = (async () => {
      if (this.autoBackupTimer) {
        clearInterval(this.autoBackupTimer);
        this.autoBackupTimer = null;
      }

      const db = this.db;
      if (!db) return;

      try {
        await this.backupDatabase('app_exit');
      } catch (e) {
        console.error('Error during app_exit backup:', e);
      }
      try {
        db.close();
        this.db = null;
      } catch (e) {
        console.error('Error closing database:', e);
      }
    })();

    return this.closePromise;
  }
}
