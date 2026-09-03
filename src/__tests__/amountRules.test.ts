import { describe, expect, it } from 'vitest';
import { normalizePositiveAmount } from '../domain/amountRules';

describe('amount domain rules', () => {
  it('normalizes numeric strings', () => {
    expect(normalizePositiveAmount('12.5', 'مبلغ المصروف')).toBe(12.5);
  });

  it('preserves the domain-specific error label', () => {
    expect(() => normalizePositiveAmount(0, 'مبلغ المصروف')).toThrow('مبلغ المصروف يجب أن يكون أكبر من صفر');
    expect(() => normalizePositiveAmount(-1, 'مبلغ الحركة')).toThrow('مبلغ الحركة يجب أن يكون أكبر من صفر');
  });
});
