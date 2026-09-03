import { describe, expect, it } from 'vitest';
import {
  addPaymentArgsSchema,
  cashAdjustmentArgsSchema,
  customerCreditApplyArgsSchema,
  customerCreditRefundArgsSchema,
  idArgsSchema,
  orderStatusArgsSchema,
  preferencesSaveArgsSchema,
  restoreBackupArgsSchema,
  settingsUpdateArgsSchema,
  stockAdjustArgsSchema,
  stockReturnPurchaseArgsSchema,
  whatsappSendArgsSchema,
} from '../services/shared/ipcSchemas';
import { parseIpcInput } from '../electron/validation/parseIpc';

describe('IPC runtime schemas', () => {
  it('accepts valid payment input and applies the optional payment id', () => {
    const result = addPaymentArgsSchema.safeParse({
      invoiceId: 'INV-1001',
      amount: 0.01,
      method: 'cash',
      note: '',
      paymentId: 'PAY-1001',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paymentId).toBe('PAY-1001');
  });

  it('rejects invalid payment numbers, methods, ids, and extra fields', () => {
    const base = { invoiceId: 'INV-1001', method: 'cash', note: '' };

    expect(addPaymentArgsSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(addPaymentArgsSchema.safeParse({ ...base, amount: -1 }).success).toBe(false);
    expect(addPaymentArgsSchema.safeParse({ ...base, amount: Number.NaN }).success).toBe(false);
    expect(addPaymentArgsSchema.safeParse({ ...base, amount: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(addPaymentArgsSchema.safeParse({ ...base, amount: 10, method: 'crypto' }).success).toBe(false);
    expect(addPaymentArgsSchema.safeParse({ ...base, amount: 10, unexpected: true }).success).toBe(false);
  });

  it('allows signed quantity only for the legacy adjustment direction', () => {
    const base = { itemType: 'fabric', itemId: 'FAB-1', reason: 'تسوية اختبار' };

    expect(stockAdjustArgsSchema.safeParse({ ...base, quantity: -2, direction: 'adjustment' }).success).toBe(true);
    expect(stockAdjustArgsSchema.safeParse({ ...base, quantity: 2, direction: 'adjustment_in', unitCost: 0 }).success).toBe(true);
    expect(stockAdjustArgsSchema.safeParse({ ...base, quantity: -2, direction: 'adjustment_in' }).success).toBe(false);
    expect(stockAdjustArgsSchema.safeParse({ ...base, quantity: 0, direction: 'adjustment' }).success).toBe(false);
    expect(stockAdjustArgsSchema.safeParse({ ...base, quantity: Number.POSITIVE_INFINITY, direction: 'adjustment' }).success).toBe(false);
  });

  it('accepts valid purchase return input and rejects negative return quantity', () => {
    const valid = stockReturnPurchaseArgsSchema.safeParse({
      itemType: 'accessory',
      itemId: 'ACC-1',
      quantity: 1,
      reason: 'إرجاع شراء',
      originalMovementId: 'MOV-1',
      purchaseId: 'PUR-1',
    });

    expect(valid.success).toBe(true);
    expect(stockReturnPurchaseArgsSchema.safeParse({
      itemType: 'accessory',
      itemId: 'ACC-1',
      quantity: -1,
      reason: 'إرجاع شراء',
    }).success).toBe(false);
  });

  it('requires idempotency keys for customer credit operations', () => {
    expect(customerCreditApplyArgsSchema.safeParse({
      customerId: 'CUS-1',
      targetInvoiceId: 'INV-1',
      amount: 10,
      idempotencyKey: 'credit-apply-1',
      reason: 'تطبيق رصيد',
    }).success).toBe(true);

    expect(customerCreditApplyArgsSchema.safeParse({
      customerId: 'CUS-1',
      targetInvoiceId: 'INV-1',
      amount: 10,
      idempotencyKey: '',
      reason: 'تطبيق رصيد',
    }).success).toBe(false);

    expect(customerCreditRefundArgsSchema.safeParse({
      customerId: 'CUS-1',
      amount: 10,
      method: 'cash',
      idempotencyKey: 'credit-refund-1',
      reason: 'استرداد رصيد',
      actorId: 'renderer-value-is-ignored-by-main',
    }).success).toBe(true);
  });

  it('validates cash adjustment shape while leaving domain rules to the service', () => {
    const valid = cashAdjustmentArgsSchema.safeParse({
      amount: 10,
      paymentMethod: 'cash',
      description: 'رصيد افتتاحي',
      sourceType: 'opening_balance',
      direction: 'in',
    });

    expect(valid.success).toBe(true);
    expect(cashAdjustmentArgsSchema.safeParse({
      amount: 10,
      paymentMethod: 'cash',
      description: '',
      sourceType: 'adjustment',
      direction: 'in',
    }).success).toBe(false);
    expect(cashAdjustmentArgsSchema.safeParse({
      amount: Number.NaN,
      paymentMethod: 'cash',
      description: 'حركة',
    }).success).toBe(false);
  });

  it('accepts a bounded backup string and rejects invalid restore input', () => {
    expect(restoreBackupArgsSchema.safeParse('{"version":1}').success).toBe(true);
    expect(restoreBackupArgsSchema.safeParse('').success).toBe(false);
    expect(restoreBackupArgsSchema.safeParse(null).success).toBe(false);
    expect(restoreBackupArgsSchema.safeParse(123).success).toBe(false);
  });

  it('returns a friendly Arabic validation error through parseIpcInput', () => {
    expect(() => parseIpcInput(
      addPaymentArgsSchema,
      { invoiceId: '', amount: -1, method: 'cash', note: '' },
      'بيانات الدفعة',
    )).toThrow(/بيانات الدفعة غير صالح/);
  });
});


describe('IPC runtime schemas for the second hardening batch', () => {
  it('accepts supported order status and rejects unknown status', () => {
    expect(orderStatusArgsSchema.safeParse({ orderId: 'ORD-1', status: 'ready' }).success).toBe(true);
    expect(orderStatusArgsSchema.safeParse({ orderId: 'ORD-1', status: 'archived' }).success).toBe(false);
    expect(idArgsSchema.safeParse({ id: 'ORD-1' }).success).toBe(true);
    expect(idArgsSchema.safeParse({ id: '' }).success).toBe(false);
  });

  it('accepts WhatsApp input and rejects oversized or incomplete values', () => {
    expect(whatsappSendArgsSchema.safeParse({
      phone: '0500000000',
      customerName: 'عميل اختبار',
      orderNumber: '1001',
      statusText: 'جاهز',
    }).success).toBe(true);

    expect(whatsappSendArgsSchema.safeParse({
      phone: '0500000000',
      customerName: '',
      orderNumber: '1001',
      statusText: 'جاهز',
    }).success).toBe(false);

    expect(whatsappSendArgsSchema.safeParse({
      phone: '0500000000',
      customerName: 'عميل اختبار',
      orderNumber: '1001',
      statusText: 'x'.repeat(201),
    }).success).toBe(false);
  });

  it('accepts partial preferences and rejects unknown preference fields', () => {
    expect(preferencesSaveArgsSchema.safeParse({ activeTab: 'orders' }).success).toBe(true);
    expect(preferencesSaveArgsSchema.safeParse({ shopName: 'محل الاختبار', invoicePrintMode: 'summary' }).success).toBe(true);
    expect(preferencesSaveArgsSchema.safeParse({ activeTab: 'unknown' }).success).toBe(false);
    expect(preferencesSaveArgsSchema.safeParse({ activeTab: 'orders', unknown: true }).success).toBe(false);
  });

  it('accepts supported settings and rejects unbounded types', () => {
    expect(settingsUpdateArgsSchema.safeParse({ key: 'autoBackupIntervalHours', value: 1 }).success).toBe(true);
    expect(settingsUpdateArgsSchema.safeParse({ key: 'dataCleared', value: 'true' }).success).toBe(false);
    expect(settingsUpdateArgsSchema.safeParse({ key: 'notASetting', value: 1 }).success).toBe(false);
    expect(settingsUpdateArgsSchema.safeParse({ key: 'maxBackupFiles', value: Number.NaN }).success).toBe(false);
  });
});
