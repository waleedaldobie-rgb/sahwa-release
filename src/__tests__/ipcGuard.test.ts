import { describe, expect, it, beforeEach } from 'vitest';
import { assertTrustedSender, setTrustedWindow } from '../electron/security/ipcGuard';

function fakeEvent(sender: unknown, frameParent: unknown = null): any {
  return { sender, senderFrame: { parent: frameParent } };
}

describe('ipcGuard - التحقق من مصدر IPC', () => {
  beforeEach(() => setTrustedWindow(null));

  it('يرفض الطلبات قبل تعيين نافذة موثوقة', () => {
    expect(() => assertTrustedSender(fakeEvent({ id: 1 }), 'customers:list')).toThrow(/غير موثوق/);
  });

  it('يرفض طلبًا من نافذة غير موثوقة', () => {
    const trustedWebContents = { id: 7 };
    setTrustedWindow({ webContents: trustedWebContents } as any);
    expect(() => assertTrustedSender(fakeEvent({ id: 99 }), 'customers:list')).toThrow(/غير موثوق/);
  });

  it('يقبل الطلب من النافذة الموثوقة', () => {
    const trustedWebContents = { id: 7 };
    setTrustedWindow({ webContents: trustedWebContents } as any);
    expect(() => assertTrustedSender(fakeEvent(trustedWebContents), 'customers:list')).not.toThrow();
  });

  it('يرفض طلب قناة حساسة قادمًا من إطار فرعي', () => {
    const trustedWebContents = { id: 7 };
    setTrustedWindow({ webContents: trustedWebContents } as any);
    expect(() => assertTrustedSender(fakeEvent(trustedWebContents, { id: 'parent' }), 'system:restore')).toThrow(/غير موثوق/);
  });

  it('يقبل القناة الحساسة من الإطار الرئيسي الموثوق', () => {
    const trustedWebContents = { id: 7 };
    setTrustedWindow({ webContents: trustedWebContents } as any);
    expect(() => assertTrustedSender(fakeEvent(trustedWebContents, null), 'system:clearAllData')).not.toThrow();
  });
});
