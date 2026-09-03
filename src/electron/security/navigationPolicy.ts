/**
 * سياسة التنقل وفتح النوافذ — دوال نقية قابلة للاختبار.
 * الواجهة (Renderer) ممنوعة من التنقل أو فتح نوافذ خارجية.
 * الاستثناء الوحيد: روابط WhatsApp تُفتح في المتصفح الخارجي.
 */
const WHATSAPP_URL_PREFIXES = [
  'https://wa.me/',
  'https://api.whatsapp.com/',
] as const;

export function isAllowedExternalUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  return WHATSAPP_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function isSameOriginNavigation(currentUrl: string, nextUrl: string): boolean {
  if (typeof currentUrl !== 'string' || typeof nextUrl !== 'string') return false;
  if (currentUrl === nextUrl) return true;
  if (!currentUrl) return false;
  try {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl);
    if (current.protocol === 'file:' && next.protocol === 'file:') return true;
    return current.origin === next.origin;
  } catch {
    return false;
  }
}
