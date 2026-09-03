/**
 * لائحة مفاتيح الإعدادات التي يسمح للواجهة (Renderer) بتعديلها.
 * مفاتيح النظام الداخلية (schemaVersion, lastBackupTimestamp, dataCleared)
 * تُدار حصريًا من Main Process عبر المسارات الداخلية.
 */
export const UI_WRITABLE_SETTING_KEYS = [
  'fabricConsumptionRatePerGarment',
  'autoBackupIntervalHours',
  'maxBackupFiles',
] as const;

export type UiWritableSettingKey = (typeof UI_WRITABLE_SETTING_KEYS)[number];

export function isUiWritableSettingKey(key: string): key is UiWritableSettingKey {
  return (UI_WRITABLE_SETTING_KEYS as readonly string[]).includes(key);
}

export function assertUiWritableSettingKey(key: string): asserts key is UiWritableSettingKey {
  if (!isUiWritableSettingKey(key)) {
    throw new Error('لا يمكن تعديل إعدادات النظام الداخلية من الواجهة.');
  }
}
