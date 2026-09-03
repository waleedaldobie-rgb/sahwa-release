import { describe, expect, it } from 'vitest';
import { ALLOWED_ORDER_STATUS_TRANSITIONS, assertSafeInitialOrderStatus, assertValidOrderStatus, calculateMaterialCost, materialSignature } from '../domain/orderRules';
import { calculateOrderAmounts as calculateOrderAmountsFromShared } from '../services/shared/orderRules';
import { assertValidPaymentMethod } from '../domain/paymentRules';

describe('shared order rules', () => {
  it('calculates order amounts and payment status consistently', () => {
    expect(calculateOrderAmountsFromShared(300, 100)).toEqual({ totalAmount: 300, paidAmount: 100, remainingAmount: 200, paymentStatus: 'partial' });
    expect(calculateOrderAmountsFromShared(300, 300).paymentStatus).toBe('paid');
    expect(calculateOrderAmountsFromShared(300, 0).paymentStatus).toBe('unpaid');
  });

  it('calculates material cost from historical usage prices', () => {
    expect(calculateMaterialCost([
      { totalCost: 12.5 },
      { totalCost: 4.25 }
    ] as any)).toBe(16.75);
  });

  it('creates an order-material signature independent of row order', () => {
    const first = materialSignature([
      { itemType: 'accessory', itemId: 'ACC-2', quantity: 2, unit: 'حبة', unitCostAtUsage: 1.5 },
      { itemType: 'accessory', itemId: 'ACC-1', quantity: 1, unit: 'حبة', unitCostAtUsage: 2 }
    ]);
    const second = materialSignature([
      { item_type: 'accessory', item_id: 'ACC-1', quantity: 1, unit: 'حبة', unit_cost_at_usage: 2 },
      { item_type: 'accessory', item_id: 'ACC-2', quantity: 2, unit: 'حبة', unit_cost_at_usage: 1.5 }
    ]);
    expect(first).toBe(second);
  });
});


describe('production financial invariants', () => {
  it('rejects negative totals, negative payments, and overpayment', () => {
    expect(() => calculateOrderAmountsFromShared(-1, 0)).toThrow(/غير سالب/);
    expect(() => calculateOrderAmountsFromShared(100, -1)).toThrow(/غير سالب/);
    expect(() => calculateOrderAmountsFromShared(100, 101)).toThrow(/يتجاوز/);
  });

  it('accepts only supported order statuses and safe initial status', () => {
    expect(assertValidOrderStatus('processing')).toBe('processing');
    expect(assertSafeInitialOrderStatus(undefined)).toBe('new');
    expect(() => assertValidOrderStatus('unknown')).toThrow(/حالة الطلب/);
    expect(() => assertSafeInitialOrderStatus('cancelled')).toThrow(/لا يمكن إنشاء/);
  });

  it('allows adjacent backward status corrections without allowing arbitrary jumps', () => {
    expect(ALLOWED_ORDER_STATUS_TRANSITIONS.delivered).toEqual(['ready']);
    expect(ALLOWED_ORDER_STATUS_TRANSITIONS.ready).toContain('processing');
    expect(ALLOWED_ORDER_STATUS_TRANSITIONS.processing).toContain('new');
    expect(ALLOWED_ORDER_STATUS_TRANSITIONS.new).not.toContain('ready');
    expect(ALLOWED_ORDER_STATUS_TRANSITIONS.delivered).not.toContain('processing');
  });

  it('accepts only supported payment methods', () => {
    expect(assertValidPaymentMethod('cash')).toBe('cash');
    expect(assertValidPaymentMethod('card')).toBe('card');
    expect(assertValidPaymentMethod('transfer')).toBe('transfer');
    expect(() => assertValidPaymentMethod('bitcoin')).toThrow(/طريقة الدفع/);
    expect(() => assertValidPaymentMethod('')).toThrow(/طريقة الدفع/);
  });
});
