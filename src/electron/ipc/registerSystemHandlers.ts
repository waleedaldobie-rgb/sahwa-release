import { ipcMain } from 'electron';
import { safeIpcHandle } from '../errorHandler';
import { SahwaDatabaseManager } from '../db';
import { NotificationRepository } from '../repositories/notificationRepository';
import { WhatsAppService } from '../services/whatsappService';
import { DatabaseIntegrityService } from '../services/databaseIntegrityService';
import {
  idArgsSchema,
  preferencesSaveArgsSchema,
  restoreBackupArgsSchema,
  settingsUpdateArgsSchema,
  whatsappSendArgsSchema,
} from '../../services/shared/ipcSchemas';
import { parseIpcInput } from '../validation/parseIpc';
import { queryDashboardSummary } from '../dashboard/queryDashboardSummary';

interface SystemHandlersDeps {
  dbManager: SahwaDatabaseManager;
  notificationRepository: NotificationRepository;
  whatsappService: WhatsAppService;
}

export function registerSystemHandlers(deps: SystemHandlersDeps): void {
  const { dbManager, notificationRepository, whatsappService } = deps;
  const db = dbManager.getRawDb();

  safeIpcHandle(ipcMain, 'data:get', async () => {
    return dbManager.exportFullDataAsJson(false);
  });

  safeIpcHandle(ipcMain, 'notifications:list', async (_, includeArchived = false) => notificationRepository.list(Boolean(includeArchived)));

  safeIpcHandle(ipcMain, 'dashboard:getSummary', async () => queryDashboardSummary(db));
  safeIpcHandle(ipcMain, 'notifications:markRead', async (_, id: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id }, 'معرّف الإشعار');
    return notificationRepository.markRead(input.id);
  });
  safeIpcHandle(ipcMain, 'notifications:markAllRead', async () => ({ updated: notificationRepository.markAllRead() }));
  safeIpcHandle(ipcMain, 'notifications:clearAll', async () => ({ archived: notificationRepository.archiveAll() }));
  safeIpcHandle(ipcMain, 'notifications:retry', async (_, id: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id }, 'معرّف الإشعار');
    return notificationRepository.retry(input.id);
  });

  safeIpcHandle(ipcMain, 'data:save', async (_, data: { notifications?: any[] }) => {
    if (!data || !Array.isArray(data.notifications)) return false;
    return dbManager.replaceNotifications(data.notifications);
  });

  safeIpcHandle(ipcMain, 'preferences:get', async () => {
    return dbManager.getUserPreferences();
  });

  safeIpcHandle(ipcMain, 'preferences:save', async (_, preferences: unknown) => {
    const input = parseIpcInput(preferencesSaveArgsSchema, preferences, 'إعدادات المستخدم');
    return dbManager.updateUserPreferences(input);
  });

  safeIpcHandle(ipcMain, 'system:backup', async () => {
    const result = await dbManager.backupDatabase('manual_user');
    if (!result.success) throw new Error(result.error || 'فشل إنشاء النسخة الاحتياطية');
    return JSON.stringify(dbManager.exportFullDataAsJson(), null, 2);
  });

  safeIpcHandle(ipcMain, 'system:restore', async (_, jsonContent: unknown) => {
    const input = parseIpcInput(restoreBackupArgsSchema, jsonContent, 'ملف النسخة الاحتياطية');
    return dbManager.restoreFromJson(input);
  });

  safeIpcHandle(ipcMain, 'system:clearAllData', async () => {
    return dbManager.clearAllData();
  });

  safeIpcHandle(ipcMain, 'system:integrityCheck', async () => {
    return new DatabaseIntegrityService(db).check();
  });

  safeIpcHandle(ipcMain, 'reports:exportExcel', async (_, startDate?: string, endDate?: string) => {
    const buffer = await dbManager.generateExcelReport(startDate, endDate);
    return buffer.toString('base64');
  });

  safeIpcHandle(ipcMain, 'settings:get', async () => {
    return dbManager.getSettings();
  });

  safeIpcHandle(ipcMain, 'settings:update', async (_, request: unknown) => {
    const input = parseIpcInput(settingsUpdateArgsSchema, request, 'تحديث الإعدادات');
    dbManager.updateSetting(input.key, input.value);
    return true;
  });

  safeIpcHandle(ipcMain, 'whatsapp:send', async (_, request: unknown) => {
    const input = parseIpcInput(whatsappSendArgsSchema, request, 'بيانات رسالة WhatsApp');
    const prepared = whatsappService.prepareMessage(input.phone, input.customerName, input.orderNumber, input.statusText);
    whatsappService.beginDelivery(input.phone, input.customerName, input.orderNumber, input.statusText, prepared);
    if (process.env.SAHWA_FORCE_WHATSAPP_FAILURE === '1') {
      whatsappService.recordDeliveryResult(input.phone, input.customerName, input.orderNumber, input.statusText, prepared, 'failed', 'forced failure');
      return false;
    }
    try {
      const { shell } = require('electron');
      await shell.openExternal(prepared.url);
      whatsappService.recordDeliveryResult(input.phone, input.customerName, input.orderNumber, input.statusText, prepared, 'opened');
      return true;
    } catch (e: any) {
      console.error('Failed to open external WhatsApp URL:', e);
      whatsappService.recordDeliveryResult(input.phone, input.customerName, input.orderNumber, input.statusText, prepared, 'failed', e?.message || String(e));
      return false;
    }
  });
}
