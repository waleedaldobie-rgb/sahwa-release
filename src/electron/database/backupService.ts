import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DatabaseSettings } from '../schema';

export interface BackupServiceDeps {
  getRawDb: () => Database.Database;
  getSettings: () => DatabaseSettings;
  writeSetting: (key: string, value: string | number) => void;
  exportFullDataAsJson: () => unknown;
  backupDir: string;
}

export function rotateBackups(backupDir: string, extension: string, maxFiles: number): void {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith(extension) && f.startsWith('sahwa_backup_'))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        return { name: f, path: fullPath, stat: fs.statSync(fullPath) };
      })
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    if (files.length > maxFiles) {
      const toDelete = files.slice(maxFiles);
      toDelete.forEach(file => {
        try { fs.unlinkSync(file.path); } catch {
          // ignore rotation failures
        }
      });
    }
  } catch (e) {
    console.error('Error rotating backups:', e);
  }
}

export async function performBackup(
  deps: BackupServiceDeps,
  reason: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const db = deps.getRawDb();
    const settings = deps.getSettings();
    const maxFiles = settings.maxBackupFiles || 14;

    const timeTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `sahwa_backup_${reason}_${timeTag}.db`;
    const targetPath = path.join(deps.backupDir, fileName);

    await db.backup(targetPath);

    const jsonFileName = `sahwa_backup_${reason}_${timeTag}.json`;
    const jsonTargetPath = path.join(deps.backupDir, jsonFileName);
    const exportedData = deps.exportFullDataAsJson();
    fs.writeFileSync(jsonTargetPath, JSON.stringify(exportedData, null, 2), 'utf-8');

    deps.writeSetting('lastBackupTimestamp', new Date().toISOString());

    rotateBackups(deps.backupDir, '.db', maxFiles);
    rotateBackups(deps.backupDir, '.json', maxFiles);

    return { success: true, filePath: targetPath };
  } catch (err: unknown) {
    console.error('Backup error:', err);
    const message = err instanceof Error ? err.message : 'فشل إنشاء النسخة الاحتياطية';
    return { success: false, error: message || 'فشل إنشاء النسخة الاحتياطية' };
  }
}
