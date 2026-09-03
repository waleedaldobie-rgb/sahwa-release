import { describe, expect, it } from 'vitest';
import {
  assertCancellationWriteoffIdempotent,
  calculatePaymentSettlement
} from '../domain/paymentSettlementRules';

describe('payment settlement contract', () => {
  it('separates applied payment, cash received, and overpayment liability', () => {
    expect(calculatePaymentSettlement({
      invoiceTotal: 100,
      appliedPaid: 100,
      cashReceived: 120,
      customerId: 'CUS-1'
    })).toMatchObject({
      invoiceTotal: 100,
      appliedPaid: 100,
      cashReceived: 120,
      remainingAmount: 0,
      overpaymentAmount: 20,
      liabilityAmount: 20,
      paymentStatus: 'paid'
    });
  });

  it('does not classify a partial cash receipt as overpayment before the invoice is fully applied', () => {
    expect(calculatePaymentSettlement({
      invoiceTotal: 100,
      appliedPaid: 50,
      cashReceived: 75,
      customerId: 'CUS-1'
    })).toMatchObject({
      remainingAmount: 50,
      overpaymentAmount: 0,
      liabilityAmount: 0,
      paymentStatus: 'partial'
    });
  });

  it('rejects overpayment attempts explicitly marked on a cancelled order', () => {
    expect(() => calculatePaymentSettlement({
      invoiceTotal: 100,
      appliedPaid: 100,
      cashReceived: 120,
      cancelled: true,
      rejectOverpaymentOnCancelled: true,
      customerId: 'CUS-1'
    })).toThrow(/overpayment/);
  });

  it('rejects overpayment liability when no customer is linked', () => {
    expect(() => calculatePaymentSettlement({
      invoiceTotal: 100,
      appliedPaid: 100,
      cashReceived: 120
    })).toThrow(/عميل/);
  });

  it('settles a cancelled partial invoice through non-cash writeoff', () => {
    expect(calculatePaymentSettlement({
      invoiceTotal: 300,
      appliedPaid: 100,
      cashReceived: 100,
      cancellationWriteoff: 200,
      cancelled: true,
      customerId: 'CUS-1'
    })).toMatchObject({
      remainingAmount: 0,
      cancellationWriteoffAmount: 200,
      overpaymentAmount: 0,
      paymentStatus: 'settled_by_cancellation',
      liabilityAmount: 0
    });
  });

  it('keeps a fully paid cancelled invoice as paid without writeoff', () => {
    expect(calculatePaymentSettlement({
      invoiceTotal: 300,
      appliedPaid: 300,
      cashReceived: 300,
      cancelled: true,
      customerId: 'CUS-1'
    })).toMatchObject({
      remainingAmount: 0,
      cancellationWriteoffAmount: 0,
      paymentStatus: 'paid'
    });
  });

  it('rejects a cancelled invoice that has neither full payment nor writeoff', () => {
    expect(() => calculatePaymentSettlement({
      invoiceTotal: 300,
      appliedPaid: 100,
      cashReceived: 100,
      cancelled: true,
      customerId: 'CUS-1'
    })).toThrow(/مسواة بالكامل/);
  });

  it('does not allow writeoff on a non-cancelled invoice', () => {
    expect(() => calculatePaymentSettlement({
      invoiceTotal: 300,
      appliedPaid: 100,
      cashReceived: 100,
      cancellationWriteoff: 200,
      customerId: 'CUS-1'
    })).toThrow(/ملغاة/);
  });

  it('makes cancellation writeoff idempotent for the same amount', () => {
    expect(assertCancellationWriteoffIdempotent(200, 200)).toBe('already_applied');
    expect(assertCancellationWriteoffIdempotent(0, 200)).toBe('new');
  });

  it('rejects a second cancellation writeoff with a different amount', () => {
    expect(() => assertCancellationWriteoffIdempotent(200, 150)).toThrow(/تسوية الإلغاء موجودة/);
  });
});
