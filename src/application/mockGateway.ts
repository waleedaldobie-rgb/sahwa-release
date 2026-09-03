import { initElectronMock } from '../services/electronMock';
import { createElectronGateway } from './electronGateway';
import { SahwaGateway } from './gateway';

export function createMockGateway(): SahwaGateway {
  initElectronMock();
  return createElectronGateway((typeof window !== 'undefined' ? window.electronAPI : undefined) as never);
}
