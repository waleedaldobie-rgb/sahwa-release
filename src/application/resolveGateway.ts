import { createElectronGateway } from './electronGateway';
import { createMockGateway } from './mockGateway';
import { SahwaGateway } from './gateway';
import { initElectronMock } from '../services/electronMock';

export function isRealElectronApi(api: Window['electronAPI'] | undefined): boolean {
  return Boolean(api) && !(api as { __isMock?: boolean }).__isMock;
}

export function resolveSahwaGateway(): SahwaGateway {
  initElectronMock();
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  return isRealElectronApi(api) ? createElectronGateway(api as Window['electronAPI']) : createMockGateway();
}
