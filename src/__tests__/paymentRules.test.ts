import { describe, expect, it } from 'vitest';
import { calculatePaymentUpdate, normalizePaymentAmount } from '../domain/paymentRules';

describe('payment domain rules', () => {
  it('normalizes valid positive amounts', () => {
    expect(normalizePaymentAmount('25')).toBe(25);
  });

  it('rejects zero and negative payments with the existing message', () => {
    expect(() => normalizePaymentAmount(0)).toThrow('مبلغ الدفعة يجب أن يكون أكبر من صفر');
    expect(() => normalizePaymentAmount(-1)).toThrow('مبلغ الدفعة يجب أن يكون أكبر من صفر');
  });

  it('caps applied payment at the invoice remaining amount and records overpayment separately', () => {
    expect(calculatePaymentUpdate(100, 20, 80, 81)).toEqual({
      numericAmount: 80,
      cashReceived: 81,
      overpaymentAmount: 1,
      totalAmount: 100,
      paidAmount: 100,
      remainingAmount: 0,
      paymentStatus: 'paid'
    });
  });

  it('calculates applied paid, cash received, remaining, and status consistently', () => {
    expect(calculatePaymentUpdate(100, 20, 80, 30)).toEqual({
      numericAmount: 30,
      cashReceived: 30,
      overpaymentAmount: 0,
      totalAmount: 100,
      paidAmount: 50,
      remainingAmount: 50,
      paymentStatus: 'partial'
    });
  });
});
