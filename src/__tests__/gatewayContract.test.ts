// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createElectronGateway } from '../application/electronGateway';
import { createMockGateway } from '../application/mockGateway';
import { SAHWA_GATEWAY_METHODS, type SahwaGateway } from '../application/gateway';

describe('gateway contract - توحيد التنفيذين', () => {
  it('كلا البوابتين يطابقان عقد SahwaGateway (تحقق compile-time + runtime للدوال)', () => {
    const electron: SahwaGateway = createElectronGateway(null as never);
    const mock: SahwaGateway = createMockGateway();
    for (const method of SAHWA_GATEWAY_METHODS) {
      expect(typeof (mock as Record<string, unknown>)[method]).toBe('function');
      expect(method in electron).toBe(true);
      expect(method in mock).toBe(true);
    }
  });
});
