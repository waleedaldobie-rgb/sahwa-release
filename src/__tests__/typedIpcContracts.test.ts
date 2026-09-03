import { describe, expect, it } from 'vitest';
import {
  addPaymentArgsSchema,
  orderStatusArgsSchema,
  settingsUpdateArgsSchema,
  stockAdjustArgsSchema,
  stockReturnPurchaseArgsSchema,
  whatsappSendArgsSchema,
} from '../services/shared/ipcSchemas';

describe('typed IPC request object contracts', () => {
  it('accepts valid object payloads for all sensitive channels', () => {
    const requests = [
      addPaymentArgsSchema.safeParse({
        invoiceId: 'INV-1',
        amount: 25,
        method: 'cash',
        note: 'دفعة أولى',
        paymentId: 'PAY-1',
      }),
      stockAdjustArgsSchema.safeParse({
        itemType: 'fabric',
        itemId: 'FAB-1',
        quantity: -2,
        reason: 'تسوية',
        direction: 'adjustment',
        actorId: 'system',
      }),
      stockReturnPurchaseArgsSchema.safeParse({
        itemType: 'accessory',
        itemId: 'ACC-1',
        quantity: 1,
        reason: 'إرجاع شراء',
        originalMovementId: 'MOV-1',
        purchaseId: 'PUR-1',
      }),
      orderStatusArgsSchema.safeParse({ orderId: 'ORD-1', status: 'processing' }),
      whatsappSendArgsSchema.safeParse({
        phone: '966500000000',
        customerName: 'عميل اختبار',
        orderNumber: '1001',
        statusText: 'جاهز',
      }),
      settingsUpdateArgsSchema.safeParse({ key: 'maxBackupFiles', value: 5 }),
    ];

    expect(requests.every((result) => result.success)).toBe(true);
  });

  it('rejects NaN payment amounts and unsupported payment methods', () => {
    expect(addPaymentArgsSchema.safeParse({
      invoiceId: 'INV-1',
      amount: Number.NaN,
      method: 'cash',
      note: '',
    }).success).toBe(false);

    expect(addPaymentArgsSchema.safeParse({
      invoiceId: 'INV-1',
      amount: 25,
      method: 'bank_transfer',
      note: '',
    }).success).toBe(false);
  });

  it('rejects unsupported order statuses and extra WhatsApp fields', () => {
    expect(orderStatusArgsSchema.safeParse({ orderId: 'ORD-1', status: 'unknown' }).success).toBe(false);

    expect(whatsappSendArgsSchema.safeParse({
      phone: '966500000000',
      customerName: 'عميل',
      orderNumber: '1001',
      statusText: 'جاهز',
      token: 'لا يجب تمريره',
    }).success).toBe(false);
  });

  it('rejects negative purchase returns while allowing negative adjustments', () => {
    expect(stockReturnPurchaseArgsSchema.safeParse({
      itemType: 'fabric',
      itemId: 'FAB-1',
      quantity: -1,
      reason: 'إرجاع',
    }).success).toBe(false);

    expect(stockAdjustArgsSchema.safeParse({
      itemType: 'fabric',
      itemId: 'FAB-1',
      quantity: -1,
      reason: 'تسوية',
      direction: 'adjustment',
    }).success).toBe(true);
  });
});
