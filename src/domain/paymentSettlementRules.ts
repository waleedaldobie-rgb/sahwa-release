import { round2 } from './inventoryRules';

export type SettlementPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'settled_by_cancellation';

export interface PaymentSettlementInput {
  invoiceTotal: unknown;
  appliedPaid: unknown;
  cashReceived: unknown;
  cancellationWriteoff?: unknown;
  cancelled?: boolean;
  rejectOverpaymentOnCancelled?: boolean;
  customerId?: string | null;
}

export interface PaymentSettlement {
  invoiceTotal: number;
  appliedPaid: number;
  cashReceived: number;
  remainingAmount: number;
  cancellationWriteoffAmount: number;
  overpaymentAmount: number;
  paymentStatus: SettlementPaymentStatus;
  liabilityAmount: number;
}

const EPSILON = 0.0001;

function finiteAmount(value: unknown, label: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} يجب أن يكون رقماً غير سالب`);
  }
  return round2(amount);
}

export function calculatePaymentSettlement(input: PaymentSettlementInput): PaymentSettlement {
  const invoiceTotal = finiteAmount(input.invoiceTotal, 'إجمالي الفاتورة');
  const appliedPaid = finiteAmount(input.appliedPaid, 'المبلغ المطبق');
  const cashReceived = finiteAmount(input.cashReceived, 'النقد المستلم');
  const cancellationWriteoffAmount = finiteAmount(input.cancellationWriteoff ?? 0, 'شطب الإلغاء');
  const cancelled = Boolean(input.cancelled);

  if (appliedPaid > invoiceTotal + EPSILON) {
    throw new Error('المبلغ المطبق لا يمكن أن يتجاوز إجمالي الفاتورة');
  }
  if (cashReceived + EPSILON < appliedPaid) {
    throw new Error('النقد المستلم لا يمكن أن يكون أقل من المبلغ المطبق');
  }
  if (cancellationWriteoffAmount > EPSILON && !cancelled) {
    throw new Error('شطب الإلغاء مسموح فقط للفواتير الملغاة');
  }

  const remainingAmount = round2(invoiceTotal - appliedPaid - cancellationWriteoffAmount);
  if (remainingAmount < -EPSILON) {
    throw new Error('التسوية تتجاوز إجمالي الفاتورة');
  }
  const normalizedRemaining = Math.max(0, remainingAmount);
  if (cancelled && normalizedRemaining > EPSILON) {
    throw new Error('الفاتورة الملغاة يجب أن تكون مسواة بالكامل أو بشطب إلغاء');
  }

  const overpaymentAmount = round2(Math.max(0, cashReceived - invoiceTotal));
  if (overpaymentAmount > EPSILON && (!input.customerId || (cancelled && input.rejectOverpaymentOnCancelled))) {
    throw new Error(cancelled && input.rejectOverpaymentOnCancelled ? 'لا يمكن قبول overpayment على طلب ملغى' : 'لا يمكن قبول الزيادة دون ربط الدفعة بعميل');
  }

  const paymentStatus: SettlementPaymentStatus = cancelled && cancellationWriteoffAmount > EPSILON
    ? 'settled_by_cancellation'
    : normalizedRemaining <= EPSILON
      ? 'paid'
      : appliedPaid > EPSILON
        ? 'partial'
        : 'unpaid';

  return {
    invoiceTotal,
    appliedPaid,
    cashReceived,
    remainingAmount: normalizedRemaining,
    cancellationWriteoffAmount,
    overpaymentAmount,
    paymentStatus,
    liabilityAmount: overpaymentAmount
  };
}

export function assertCancellationWriteoffIdempotent(existingAmount: unknown, requestedAmount: unknown): 'new' | 'already_applied' {
  const existing = finiteAmount(existingAmount ?? 0, 'شطب الإلغاء السابق');
  const requested = finiteAmount(requestedAmount, 'شطب الإلغاء المطلوب');
  if (existing > EPSILON && Math.abs(existing - requested) <= EPSILON) return 'already_applied';
  if (existing > EPSILON && Math.abs(existing - requested) > EPSILON) {
    throw new Error('تسوية الإلغاء موجودة بقيمة مختلفة؛ لا يجوز إنشاء تسوية ثانية');
  }
  return 'new';
}
