import Database from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, DatabaseSettings } from '../schema';
import { UserPreferences } from '../../types';
import { assertUiWritableSettingKey } from '../../services/shared/settingsGuard';

export function getSettings(db: Database.Database): DatabaseSettings {
  const rows = db.prepare('SELECT key, value FROM system_settings').all() as Array<{ key: string; value: string }>;

  const settingsMap = new Map<string, string>();
  rows.forEach(r => settingsMap.set(r.key, r.value));

  return {
    fabricConsumptionRatePerGarment: parseFloat(settingsMap.get('fabricConsumptionRatePerGarment') || '3.5'),
    autoBackupIntervalHours: parseFloat(settingsMap.get('autoBackupIntervalHours') || '1'),
    maxBackupFiles: parseInt(settingsMap.get('maxBackupFiles') || '14', 10),
    lastBackupTimestamp: settingsMap.get('lastBackupTimestamp'),
    schemaVersion: parseInt(settingsMap.get('schemaVersion') || '1', 10)
  };
}

export function writeSetting(db: Database.Database, key: string, value: string | number): void {
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function updateSetting(db: Database.Database, key: keyof DatabaseSettings | 'dataCleared', value: string | number): void {
  assertUiWritableSettingKey(key);
  writeSetting(db, key, value);
}

export function getUserPreferences(db: Database.Database): UserPreferences {
  const rows = db.prepare('SELECT key, value FROM system_settings WHERE key LIKE ?').all('ui.%') as Array<{ key: string; value: string }>;
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const invoicePrintMode = values.get('ui.invoicePrintMode') === 'summary' ? 'summary' : 'detailed';

  return {
    activeTab: values.get('ui.activeTab') || 'dashboard',
    invoicePrintMode,
    shopName: values.get('ui.shopName') || undefined,
    managerName: values.get('ui.managerName') || 'حاتم محمد الدبعي',
    shopLogoUrl: values.get('ui.shopLogoUrl') || undefined,
    shopPhone: values.get('ui.shopPhone') || undefined,
    vatNumber: values.get('ui.vatNumber') || undefined,
    shopAddress: values.get('ui.shopAddress') || undefined
  };
}

export function updateUserPreferences(db: Database.Database, preferences: Partial<UserPreferences>): boolean {
  const allowedKeys: Array<keyof UserPreferences> = [
    'activeTab', 'invoicePrintMode', 'shopName', 'managerName', 'shopLogoUrl', 'shopPhone', 'vatNumber', 'shopAddress'
  ];
  const update = db.transaction(() => {
    const statement = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
    for (const key of allowedKeys) {
      const value = preferences[key];
      if (value !== undefined) statement.run(`ui.${key}`, String(value));
    }
  });
  update();
  return true;
}

export function initSystemSettings(db: Database.Database): void {
  const defaults: Array<[string, string]> = [
    ['fabricConsumptionRatePerGarment', '3.5'],
    ['autoBackupIntervalHours', '1'],
    ['maxBackupFiles', '14'],
    ['schemaVersion', String(CURRENT_SCHEMA_VERSION)]
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
  const insertMany = db.transaction((items: Array<[string, string]>) => {
    for (const [k, v] of items) stmt.run(k, v);
  });
  insertMany(defaults);
}
