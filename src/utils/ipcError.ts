/**
 * Renderer-side helper to extract clean user-friendly Arabic error message from IPC promise rejections.
 */
export function formatIpcErrorMessage(error: any): string {
  if (!error) return 'حدث خطأ غير متوقع أثناء معالجة البيانات.';

  const message = typeof error === 'string' ? error : error.message || String(error);

  // Clean up Electron remote method invocation wrapper prefix
  // e.g., "Error invoking remote method 'fabrics:delete': لا يمكن حذف هذا الصنف لارتباطه بطلبات موجودة"
  const cleaned = message
    .replace(/^Error invoking remote method '.*?':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim();

  if (cleaned) {
    return cleaned;
  }

  return 'حدث خطأ أثناء الاتصال بالنظام، يرجى المحاولة لاحقاً.';
}
