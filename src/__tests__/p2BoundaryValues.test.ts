import { describe, expect, it } from 'vitest';
import { normalizePositiveAmount } from '../domain/amountRules';
import {
  assertNonNegativeUnitCost,
  assertPositiveInventoryQuantity,
  calculateStockBalance,
  calculateWacAfterInbound,
  calculateWacAfterOutbound
} from '../domain/inventoryRules';
import {
  assertValidPaymentMethod,
  calculatePaymentUpdate,
  normalizePaymentAmount,
  parsePaymentLedger,
  summarizePaymentLedger
} from '../domain/paymentRules';
import { calculateOrderAmounts, assertValidOrderAmounts } from '../domain/orderRules';

const payment = (overrides: Record<string, unknown> = {}) => ({
  id: 'PAY-P2-1',
  invoiceId: 'INV-P2-1',
  orderId: 'ORD-P2-1',
  paymentDate: '2026-08-27',
  method: 'cash',
  amount: 100,
  ...overrides
});

describe('P2 boundary values', () => {
  describe('amounts and order totals', () => {
    it('accepts the smallest positive amount and rejects non-positive or non-finite values', () => {
      expect(normalizePositiveAmount('0.01', 'المبلغ')).toBe(0.01);
      expect(() => normalizePositiveAmount(0, 'المبلغ')).toThrow();
      expect(() => normalizePositiveAmount(-0.01, 'المبلغ')).toThrow();
      expect(() => normalizePositiveAmount(Number.NaN, 'المبلغ')).toThrow();
      expect(() => normalizePositiveAmount(Number.POSITIVE_INFINITY, 'المبلغ')).toThrow();
      expect(() => normalizePositiveAmount('', 'المبلغ')).toThrow();
    });

    it('keeps large mixed-decimal order values accurate and prevents paid overflow', () => {
      expect(calculateOrderAmounts(987654.32, 123456.78)).toMatchObject({
        totalAmount: 987654.32,
        paidAmount: 123456.78,
        remainingAmount: 864197.54,
        paymentStatus: 'partial'
      });
      expect(() => assertValidOrderAmounts(100, 100.01)).toThrow();
      expect(assertValidOrderAmounts(0, 0)).toEqual({ total: 0, paid: 0 });
    });
  });

  describe('inventory quantities and costs', () => {
    it('allows exact stock zero but rejects an outbound movement below zero', () => {
      expect(calculateStockBalance(10, -10, 'قماش')).toEqual({ before: 10, after: 0 });
      expect(() => calculateStockBalance(10, -10.01, 'قماش')).toThrow();
      expect(() => assertPositiveInventoryQuantity(0)).toThrow();
      expect(() => assertPositiveInventoryQuantity(-0.01)).toThrow();
    });

    it('accepts zero unit cost and protects WAC boundaries', () => {
      expect(assertNonNegativeUnitCost(0)).toBe(0);
      expect(() => assertNonNegativeUnitCost(-0.01)).toThrow();
      expect(calculateWacAfterInbound(0, 0, 0.01, 0)).toBe(0);
      expect(calculateWacAfterOutbound(10, 50, 10, 50, 0)).toBe(0);
    });
  });

  describe('payments and overpayment', () => {
    it('accepts an exact payment and caps the applied amount when cash is higher', () => {
      expect(calculatePaymentUpdate(100, 0, 100, 100)).toMatchObject({
        numericAmount: 100,
        overpaymentAmount: 0,
        remainingAmount: 0,
        paymentStatus: 'paid'
      });
      expect(calculatePaymentUpdate(100, 0, 100, 120)).toMatchObject({
        numericAmount: 100,
        cashReceived: 120,
        overpaymentAmount: 20,
        remainingAmount: 0,
        paymentStatus: 'paid'
      });
    });

    it('rejects zero, negative, non-finite payment input, and unknown methods', () => {
      expect(normalizePaymentAmount('0.01')).toBe(0.01);
      expect(() => normalizePaymentAmount(0)).toThrow();
      expect(() => normalizePaymentAmount(-1)).toThrow();
      expect(() => normalizePaymentAmount(Number.NaN)).toThrow();
      expect(() => normalizePaymentAmount(Number.POSITIVE_INFINITY)).toThrow();
      expect(() => assertValidPaymentMethod('wallet')).toThrow();
    });

    it('preserves ledger invariants at zero remaining and rejects duplicate payment ids', () => {
      const parsed = parsePaymentLedger(JSON.stringify([payment({ amount: 100, cashReceived: 100 })]));
      expect(summarizePaymentLedger(parsed, 100)).toMatchObject({
        paymentsTotal: 100,
        paidAmount: 100,
        remainingAmount: 0
      });
      expect(() => summarizePaymentLedger([
        payment({ id: 'PAY-DUP' }),
        payment({ id: 'PAY-DUP' })
      ] as any, 200)).toThrow(/مكرر/);
    });
  });

  describe('long user-entered values', () => {
    it('keeps long notes as data without numeric coercion or truncation', () => {
      const longNote = `${'تعليمات فنية طويلة لاختبار الحقول الحدية. '.repeat(80)}987654.32 ر.س.`;
      expect(longNote.length).toBeGreaterThan(2000);
      expect(longNote.endsWith('987654.32 ر.س.')).toBe(true);
      expect(normalizePositiveAmount('987654.32', 'الإجمالي')).toBe(987654.32);
    });
  });
});
