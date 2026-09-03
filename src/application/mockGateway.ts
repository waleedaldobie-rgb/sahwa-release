import type { SahwaGateway } from './gateway';
import { createElectronGateway } from './electronGateway';
import { initElectronMock } from '../services/electronMock';

export function createMockGateway(): SahwaGateway {
  initElectronMock();
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('createMockGateway: window.electronAPI غير متاح بعد initElectronMock');
  }
  return createElectronGateway(window.electronAPI);
}
