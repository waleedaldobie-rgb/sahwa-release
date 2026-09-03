import { describe, expect, it } from 'vitest';
import {
  allocateCreditFIFO,
  assertApplicationTarget,
  assertBalanceAfter,
  assertCustomerCreditAmountWithinBalance,
  assertPositiveMoney,
  assertRefundRequest,
  calculateCustomerCreditBalance
} from '../domain/customerCreditRules';

const application = (overrides: Record<string, unknown> = {}) => ({
  customerId: 'CUS-1',
  targetInvoiceId: 'INV-2',
  targetOrderId: 'ORD-2',
  targetInvoiceCustomerId: 'CUS-1',
  targetInvoiceStatus: 'partial',
  targetRemainingAmount: 100,
  sourceInvoiceId: 'INV-1',
  amount: 20,
  availableBalance: 20,
  idempotencyKey: 'apply-1',
  ...overrides
});

describe('customer credit domain rules', () => {
  it('calculates created minus applied minus refunded balance', () => {
    expect(calculateCustomerCreditBalance([
      { entryType: 'created', amount: 20 },
      { entryType: 'applied', amount: 7.5 },
      { entryType: 'refunded', amount: 2.5 }
    ])).toBe(10);
  });

  it('rejects invalid positive money and accepts safe floating-point rounding', () => {
    expect(() => assertPositiveMoney(0)).toThrow();
    expect(() => assertPositiveMoney(-1)).toThrow();
    expect(() => assertPositiveMoney(Number.NaN)).toThrow();
    expect(() => assertPositiveMoney(1.001)).toThrow(/precision/);
    expect(() => assertPositiveMoney(0.1 + 0.2)).not.toThrow();
  });

  it('validates amount against available balance', () => {
    expect(() => assertCustomerCreditAmountWithinBalance(10, 10)).not.toThrow();
    expect(() => assertCustomerCreditAmountWithinBalance(10.01, 10)).toThrow(/exceeds/);
    expect(() => assertCustomerCreditAmountWithinBalance(1, -1)).toThrow(/invalid/);
  });

  it('accepts a later same-customer invoice with remaining balance', () => {
    expect(() => assertApplicationTarget(application())).not.toThrow();
  });

  it('rejects source, cancelled, fully paid, different-customer, and missing-target applications', () => {
    expect(() => assertApplicationTarget(application({ targetInvoiceId: 'INV-1' }))).toThrow(/source/);
    expect(() => assertApplicationTarget(application({ targetInvoiceStatus: 'cancelled' }))).toThrow(/cancelled/);
    expect(() => assertApplicationTarget(application({ targetRemainingAmount: 0 }))).toThrow(/remaining/);
    expect(() => assertApplicationTarget(application({ targetInvoiceCustomerId: 'CUS-2' }))).toThrow(/same customer/);
    expect(() => assertApplicationTarget(application({ targetOrderId: '' }))).toThrow(/targetOrderId/);
  });

  it('validates explicit refund with actor, reason, method, and balance', () => {
    expect(() => assertRefundRequest({
      customerId: 'CUS-1', amount: 10, method: 'cash', availableBalance: 10,
      idempotencyKey: 'refund-1', actorId: 'USER-1', reason: 'Customer request'
    })).not.toThrow();
    expect(() => assertRefundRequest({
      customerId: 'CUS-1', amount: 10, method: 'customer_credit' as never, availableBalance: 10,
      idempotencyKey: 'refund-1', actorId: 'USER-1', reason: 'Customer request'
    })).toThrow(/method/);
    expect(() => assertRefundRequest({
      customerId: 'CUS-1', amount: 10, method: 'cash', availableBalance: 10,
      idempotencyKey: 'refund-1', actorId: 'USER-1', reason: '   '
    })).toThrow(/reason/);
  });

  it('allocates one FIFO source and returns a temporary balanceAfter placeholder', () => {
    expect(allocateCreditFIFO([
      { id: 'C-1', createdAt: '2026-01-01', amount: 20, alreadyDebited: 0 }
    ], 12)).toEqual([{ sourceEntryId: 'C-1', amount: 12, balanceAfter: 0 }]);
  });

  it('allocates across multiple sources in oldest-first order', () => {
    expect(allocateCreditFIFO([
      { id: 'C-2', createdAt: '2026-02-01', amount: 10, alreadyDebited: 0 },
      { id: 'C-1', createdAt: '2026-01-01', amount: 10, alreadyDebited: 2 },
      { id: 'C-3', createdAt: '2026-03-01', amount: 50, alreadyDebited: 50 }
    ], 15)).toEqual([
      { sourceEntryId: 'C-1', amount: 8, balanceAfter: 0 },
      { sourceEntryId: 'C-2', amount: 7, balanceAfter: 0 }
    ]);
  });

  it('rejects FIFO allocation when available sources are insufficient', () => {
    expect(() => allocateCreditFIFO([
      { id: 'C-1', createdAt: '2026-01-01', amount: 5, alreadyDebited: 0 }
    ], 6)).toThrow(/Insufficient/);
  });

  it('validates balance_after for each ledger movement', () => {
    expect(() => assertBalanceAfter(20, 'applied', 7.5, 12.5)).not.toThrow();
    expect(() => assertBalanceAfter(20, 'refunded', 7.5, 12.5)).not.toThrow();
    expect(() => assertBalanceAfter(20, 'created', 7.5, 27.5)).not.toThrow();
    expect(() => assertBalanceAfter(20, 'applied', 7.5, 20)).toThrow(/balance_after/);
    expect(() => assertBalanceAfter(5, 'applied', 6, -1)).toThrow();
  });

  it('rounds ledger balances to two decimals without creating a negative residual', () => {
    expect(calculateCustomerCreditBalance([
      { entryType: 'created', amount: 0.1 + 0.2 },
      { entryType: 'applied', amount: 0.3 }
    ])).toBe(0);
    expect(() => calculateCustomerCreditBalance([
      { entryType: 'created', amount: 1 },
      { entryType: 'refunded', amount: 1.01 }
    ])).toThrow(/negative/);
  });
});
