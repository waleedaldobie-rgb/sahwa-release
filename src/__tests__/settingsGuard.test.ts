import { describe, expect, it } from 'vitest';
import {
  isUiWritableSettingKey,
  assertUiWritableSettingKey,
  UI_WRITABLE_SETTING_KEYS,
} from '../services/shared/settingsGuard';

describe('settingsGuard - حماية مفاتيح الإعدادات', () => {
  it('يسمح بمفاتيح واجهة المستخدم المسموحة', () => {
    for (const key of UI_WRITABLE_SETTING_KEYS) {
      expect(isUiWritableSettingKey(key)).toBe(true);
      expect(() => assertUiWritableSettingKey(key)).not.toThrow();
    }
  });

  it('يرفض مفاتيح النظام الداخلية', () => {
    for (const key of ['schemaVersion', 'lastBackupTimestamp', 'dataCleared']) {
      expect(isUiWritableSettingKey(key)).toBe(false);
      expect(() => assertUiWritableSettingKey(key)).toThrow(/لا يمكن تعديل/);
    }
  });

  it('يرفض أي مفتاح غير معروف', () => {
    expect(isUiWritableSettingKey('anythingElse')).toBe(false);
    expect(() => assertUiWritableSettingKey('anythingElse')).toThrow();
  });
});
