/**
 * Global Exception Handler for Electron IPC Database Operations
 * Translates low-level SQLite / Database / System errors into friendly Arabic messages for the user.
 */
import { assertTrustedSender } from './security/ipcGuard';

export function translateDatabaseError(error: any): Error {
  if (!error) {
    return new Error('حدث خطأ غير متوقع أثناء معالجة البيانات.');
  }

  const rawMsg = error.message || String(error);
  const code = error.code || '';

  console.error('[Global Exception Handler] Caught IPC Error:', { code, rawMsg, error });

  // 1. Foreign Key Constraint Failure
  if (
    code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    rawMsg.includes('FOREIGN KEY constraint failed') ||
    rawMsg.includes('foreign key') ||
    rawMsg.includes('FOREIGNKEY')
  ) {
    return new Error('لا يمكن حذف هذا الصنف لارتباطه بطلبات موجودة');
  }

  // 2. Unique Constraint Failure
  if (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    rawMsg.includes('UNIQUE constraint failed') ||
    rawMsg.includes('unique constraint')
  ) {
    return new Error('لا يمكن الإضافة: هذا الرقم أو السجل مسجل مسبقاً في النظام.');
  }

  // 3. Not Null Constraint Failure
  if (
    code === 'SQLITE_CONSTRAINT_NOTNULL' ||
    rawMsg.includes('NOT NULL constraint failed')
  ) {
    return new Error('تعذر الحفظ: توجد بيانات أساسية إلزامية مفقودة، يرجى استكمال كافة الحقول.');
  }

  // 4. Database Busy or Locked
  if (
    code === 'SQLITE_BUSY' ||
    rawMsg.includes('database is locked') ||
    rawMsg.includes('database table is locked')
  ) {
    return new Error('قاعدة البيانات مشغولة حالياً بعملية أخرى، يرجى المحاولة بعد لحظات.');
  }

  // 5. Database Corrupt
  if (
    code === 'SQLITE_CORRUPT' ||
    rawMsg.includes('database disk image is malformed')
  ) {
    return new Error('تنبيه: تم اكتشاف خلل في ملف قاعدة البيانات، يرجى استعادة نسخة احتياطية.');
  }

  // 6. Arabic Custom Business Logic Error
  if (/[\u0600-\u06FF]/.test(rawMsg)) {
    const cleanMsg = rawMsg.replace(/^Error invoking remote method '.*?':\s*/, '').replace(/^Error:\s*/, '');
    return new Error(cleanMsg);
  }

  // 7. Generic System Error Fallback
  return new Error('حدث خطأ غير متوقع أثناء تنفيذ العملية، يرجى إعادة المحاولة لاحقاً.');
}

/**
 * Higher-order wrapper around ipcMain.handle that automatically intercepts exceptions and applies global translation.
 * Phase 1 hardening: validates the IPC sender and rejects oversized payloads before reaching services.
 */
export function safeIpcHandle(
  ipcMain: Electron.IpcMain,
  channel: string,
  handler: (...args: any[]) => Promise<any> | any
) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedSender(event, channel);

      // حارس حجم الحمولة: يرفض الاستدعاءات العملاقة قبل الوصول للخدمات
      const payloadSize = JSON.stringify(args)?.length ?? 0;
      const MAX_PAYLOAD_BYTES = 110_000_000; // 110MB
      if (payloadSize > MAX_PAYLOAD_BYTES) {
        throw new Error('حجم البيانات أكبر من الحد المسموح.');
      }

      return await handler(event, ...args);
    } catch (error: any) {
      const friendlyError = translateDatabaseError(error);
      throw friendlyError;
    }
  });
}
