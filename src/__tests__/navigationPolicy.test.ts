import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl, isSameOriginNavigation } from '../electron/security/navigationPolicy';

describe('navigationPolicy - سياسة التنقل وفتح النوافذ', () => {
  it('يسمح فقط بروابط واتساب الخارجية', () => {
    expect(isAllowedExternalUrl('https://wa.me/9665')).toBe(true);
    expect(isAllowedExternalUrl('https://api.whatsapp.com/send?phone=9665')).toBe(true);
    expect(isAllowedExternalUrl('https://evil.example.com')).toBe(false);
    expect(isAllowedExternalUrl('http://localhost:3000')).toBe(false);
    expect(isAllowedExternalUrl('')).toBe(false);
  });

  it('يمنع التنقل بين أصول مختلفة', () => {
    expect(isSameOriginNavigation('http://localhost:3000/', 'http://localhost:3000/orders')).toBe(true);
    expect(isSameOriginNavigation('http://localhost:3000/', 'https://evil.example.com')).toBe(false);
    expect(isSameOriginNavigation('', 'https://evil.example.com')).toBe(false);
    expect(isSameOriginNavigation('file:///app/index.html', 'file:///app/other.html')).toBe(true);
  });
});
