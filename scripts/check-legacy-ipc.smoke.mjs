import assert from 'node:assert/strict';
import { findLegacyIpcViolations, scanRepository } from './check-legacy-ipc.mjs';

const objectCalls = `
  window.electronAPI.addPayment({ invoiceId: 'INV-1', amount: 10, method: 'cash', note: 'اختبار' });
  api.updateOrderStatus({ orderId: 'ORD-1', status: 'cancelled' });
  await call('stock:adjust', { itemType: 'fabric', itemId: 'FAB-1', quantity: 1, reason: 'اختبار' });
`;
assert.deepEqual(findLegacyIpcViolations(objectCalls, 'object-fixture.ts'), []);

const positionalCalls = `
  window.electronAPI.addPayment('INV-1', 10, 'cash', 'اختبار');
  api.updateOrderStatus('ORD-1', 'cancelled');
  await call('stock:adjust', 'fabric', 'FAB-1', 1, 'اختبار');
`;
const violations = findLegacyIpcViolations(positionalCalls, 'positional-fixture.ts');
assert.equal(violations.length, 3);
assert.deepEqual(violations.map(({ name, kind }) => ({ name, kind })), [
  { name: 'addPayment', kind: 'public-api' },
  { name: 'updateOrderStatus', kind: 'aliased-api' },
  { name: 'stock:adjust', kind: 'integration-helper' },
]);

const repositoryViolations = scanRepository(process.cwd());
assert.deepEqual(repositoryViolations, [], `Repository has unexpected legacy IPC callers:\n${repositoryViolations.map((item) => item.message).join('\n')}`);

console.log('Legacy IPC static guard tests passed.');
