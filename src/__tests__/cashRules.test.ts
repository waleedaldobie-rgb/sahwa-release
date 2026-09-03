import { describe, expect, it } from 'vitest';
import { calculateCashDrawerSummary } from '../domain/cashRules';

const tx = (overrides: Record<string, unknown>) => ({
  id: 'TX', direction: 'out', sourceType: 'purchase', amount: 100, paymentMethod: 'cash', transactionDate: '2026-08-19', description: 'test', createdAt: '2026-08-19T00:00:00.000Z',
  ...overrides
}) as any;

describe('cash drawer rules', () => {
  it('excludes card and transfer transactions from the cash drawer', () => {
    const summary = calculateCashDrawerSummary([
      tx({ id: 'OPEN', direction: 'in', sourceType: 'opening_balance', amount: 1000 }),
      tx({ id: 'CASH', direction: 'out', paymentMethod: 'cash', amount: 100 }),
      tx({ id: 'CARD', direction: 'out', paymentMethod: 'card', amount: 200 }),
      tx({ id: 'TRANSFER', direction: 'out', paymentMethod: 'transfer', amount: 300 })
    ]);
    expect(summary).toEqual({ openingBalance: 1000, income: 0, out: 100, balance: 900 });
  });
});
