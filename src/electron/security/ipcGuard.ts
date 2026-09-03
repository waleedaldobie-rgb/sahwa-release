/**
 * Central IPC sender validation.
 * Every handler registered through safeIpcHandle() (and the automation
 * diagnostics channel) must prove it originates from the trusted main window,
 * not from a compromised iframe, devtools, or secondary webContents.
 */
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

let trustedWindow: BrowserWindow | null = null;

export function setTrustedWindow(window: BrowserWindow | null): void {
  trustedWindow = window;
}

const SENSITIVE_CHANNELS = new Set([
  'system:restore',
  'system:clearAllData',
  'settings:update',
  'reports:exportExcel',
  'automation:printToPDF',
  'automation:storageInfo',
]);

export function assertTrustedSender(event: IpcMainInvokeEvent, channel: string): void {
  if (!trustedWindow || event.sender !== trustedWindow.webContents) {
    throw new Error('مصدر الطلب غير موثوق.');
  }

  // للقنوات الحساسة: ارفض أيضًا الطلبات القادمة من إطار فرعي (iframe محقون)
  if (
    SENSITIVE_CHANNELS.has(channel) &&
    event.senderFrame &&
    event.senderFrame.parent !== null
  ) {
    throw new Error('مصدر الطلب غير موثوق.');
  }
}
