import { OrderMaterialUsage } from '../types';
import { round2 } from './inventoryRules';
import { OrderStatus, PaymentSettlementStatus } from '../types';
import { calculatePaymentSettlement } from './paymentSettlementRules';

export const ORDER_STATUSES: readonly OrderStatus[] = ['new', 'processing', 'ready', 'delivered', 'cancelled'];

/**
 * Order status changes follow the forward workflow, with adjacent backward
 * transitions allowed so an accidental status click can be corrected safely.
 */
export const ALLOWED_ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  new: ['processing', 'cancelled'],
  processing: ['new', 'ready', 'cancelled'],
  ready: ['processing', 'delivered', 'cancelled'],
  delivered: ['ready'],
  cancelled: ['new']
};

export function assertValidOrderStatus(value: unknown): OrderStatus {
  if (typeof value !== 'string' || !ORDER_STATUSES.includes(value as OrderStatus)) {
    throw new Error('حالة الطلب غير صالحة');
  }
  return value as OrderStatus;
}

export function assertSafeInitialOrderStatus(value: unknown): OrderStatus {
  const status = assertValidOrderStatus(value ?? 'new');
  if (status === 'cancelled') {
    throw new Error('لا يمكن إنشاء طلب بحالة ملغى؛ أنشئ الطلب بحالة جديدة ثم استخدم مسار الإلغاء');
  }
  return status;
}

export interface OrderAmounts {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
}

export interface CancellationSettlementResult {
  remainingAmount: number;
  cancellationWriteoffAmount: number;
  paymentStatus: Extract<PaymentSettlementStatus, 'paid' | 'settled_by_cancellation'>;
}

export function assertCancelledOrderFinancialImmutable(
  existing: Record<string, unknown>,
  next: Record<string, unknown>
): void {
  const financialFields = [
    'total_amount',
    'paid_amount',
    'remaining_amount',
    'cash_received',
    'overpayment_amount',
    'cancellation_writeoff_amount',
    'totalAmount',
    'paidAmount',
    'remainingAmount',
    'cashReceived',
    'overpaymentAmount',
    'cancellationWriteoffAmount'
  ];
  for (const field of financialFields) {
    const counterpart = field.includes('_')
      ? field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      : field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const existingValue = existing[field] ?? existing[counterpart] ?? 0;
    const nextValue = next[field] ?? next[counterpart] ?? 0;
    if (Math.abs(Number(existingValue) - Number(nextValue)) > 0.0001) {
      throw new Error('لا يمكن تعديل الحقول المالية لطلب ملغى');
    }
  }
}

export function calculateCancellationSettlement(input: {
  invoiceTotal: unknown;
  appliedPaid: unknown;
  cashReceived: unknown;
  cancellationWriteoffAmount: unknown;
  customerId?: string | null;
}): CancellationSettlementResult {
  const result = calculatePaymentSettlement({
    invoiceTotal: input.invoiceTotal,
    appliedPaid: input.appliedPaid,
    cashReceived: input.cashReceived,
    cancellationWriteoff: input.cancellationWriteoffAmount,
    cancelled: true,
    customerId: input.customerId
  });
  if (result.paymentStatus !== 'paid' && result.paymentStatus !== 'settled_by_cancellation') {
    throw new Error('حالة التسوية بعد الإلغاء غير صالحة');
  }
  return {
    remainingAmount: result.remainingAmount,
    cancellationWriteoffAmount: result.cancellationWriteoffAmount,
    paymentStatus: result.paymentStatus
  };
}

export function assertValidOrderAmounts(totalAmount: unknown, paidAmount: unknown): { total: number; paid: number } {
  const total = Number(totalAmount);
  const paid = Number(paidAmount);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error('إجمالي الطلب يجب أن يكون رقماً غير سالب');
  }
  if (!Number.isFinite(paid) || paid < 0) {
    throw new Error('المبلغ المدفوع يجب أن يكون رقماً غير سالب');
  }
  if (paid > total + 0.0001) {
    throw new Error('المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الطلب');
  }
  return { total: round2(total), paid: round2(paid) };
}

export function calculateOrderAmounts(totalAmount: number, paidAmount: number): OrderAmounts {
  const { total, paid } = assertValidOrderAmounts(totalAmount, paidAmount);
  const remainingAmount = round2(total - paid);
  return {
    totalAmount: total,
    paidAmount: paid,
    remainingAmount: Math.max(0, remainingAmount),
    paymentStatus: remainingAmount <= 0.0001 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
  };
}

export function calculateMaterialCost(usages: OrderMaterialUsage[]): number {
  return round2(usages.reduce((sum, usage) => sum + Number(usage.totalCost || 0), 0));
}

export function materialSignature(usages: Array<Partial<OrderMaterialUsage> & { item_type?: string; item_id?: string; unit_cost_at_usage?: number }>): string {
  return usages
    .filter((usage) => (usage.itemType || usage.item_type) !== 'fabric')
    .map((usage) => [
      usage.itemType || usage.item_type || '',
      usage.itemId || usage.item_id || '',
      usage.quantity ?? '',
      usage.unit || '',
      usage.unitCostAtUsage ?? usage.unit_cost_at_usage ?? ''
    ].join(':'))
    .sort()
    .join('|');
}
