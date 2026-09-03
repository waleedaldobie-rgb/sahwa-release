import { CashSourceType, CashTransaction } from '../types';

export type ManualCashSourceType = Extract<CashSourceType, 'opening_balance' | 'adjustment' | 'withdrawal'>;
export const MANUAL_CASH_SOURCE_TYPES: readonly ManualCashSourceType[] = ['opening_balance', 'adjustment', 'withdrawal'];

export type BusinessCashSourceType = Extract<CashSourceType, 'customer_payment' | 'customer_refund' | 'customer_credit_refund' | 'purchase' | 'expense' | 'sale'>;
export const BUSINESS_CASH_SOURCE_TYPES: readonly BusinessCashSourceType[] = ['customer_payment', 'customer_refund', 'customer_credit_refund', 'purchase', 'expense', 'sale'];

export const CASH_DRAWER_ALLOWED_SOURCE_TYPES: readonly CashSourceType[] = [
  ...MANUAL_CASH_SOURCE_TYPES,
  ...BUSINESS_CASH_SOURCE_TYPES
];

export function assertValidManualCashSourceType(value: unknown): ManualCashSourceType {
  if (typeof value !== 'string' || !MANUAL_CASH_SOURCE_TYPES.includes(value as ManualCashSourceType)) {
    throw new Error('مصدر الحركة اليدوية غير صالح؛ استخدم opening_balance أو adjustment أو withdrawal');
  }
  return value as ManualCashSourceType;
}

export function assertValidCashSourceType(value: unknown): CashSourceType {
  if (typeof value !== 'string' || !CASH_DRAWER_ALLOWED_SOURCE_TYPES.includes(value as CashSourceType)) {
    throw new Error('مصدر حركة Cash Drawer غير مسموح؛ راجع نوع الحركة الموثق');
  }
  return value as CashSourceType;
}

export function assertCashTransactionContract(transaction: CashTransaction): void {
  const sourceType = assertValidCashSourceType(transaction.sourceType);
  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('مبلغ حركة Cash Drawer يجب أن يكون موجباً');
  if (transaction.direction !== 'in' && transaction.direction !== 'out') throw new Error('اتجاه حركة Cash Drawer غير صالح');
  if (!transaction.transactionDate || !transaction.createdAt) throw new Error('تاريخ حركة Cash Drawer مطلوب');
  if (!transaction.description?.trim()) throw new Error('وصف حركة Cash Drawer مطلوب');

  const requiresAudit = MANUAL_CASH_SOURCE_TYPES.includes(sourceType as ManualCashSourceType)
    || sourceType === 'customer_refund'
    || sourceType === 'customer_credit_refund';
  if (requiresAudit && (!transaction.actorId?.trim() || !transaction.reason?.trim())) {
    throw new Error('كل حركة Cash Drawer اليدوية أو الاسترداد النقدي تتطلب المستخدم والسبب');
  }

  if (sourceType === 'adjustment' || sourceType === 'withdrawal') {
    if (!transaction.reason?.trim()) throw new Error('سبب adjustment أو withdrawal مطلوب');
  }
  if (sourceType === 'customer_refund' || sourceType === 'customer_credit_refund') {
    if (transaction.direction !== 'out' || transaction.paymentMethod !== 'cash') {
      throw new Error('customer_refund يجب أن يكون خروجاً نقدياً فقط');
    }
    if (!transaction.sourceId?.trim()) throw new Error('customer_refund يتطلب sourceId للعملية الأصلية');
  }
  if (sourceType === 'customer_payment' && (!transaction.sourceId?.trim() || transaction.direction !== 'in')) {
    throw new Error('customer_payment يجب أن يكون دخلاً مرتبطاً بمصدر دفعة');
  }
  if ((sourceType === 'purchase' || sourceType === 'expense') && (!transaction.sourceId?.trim() || transaction.direction !== 'out')) {
    throw new Error(`${sourceType} يجب أن يكون خروجاً مرتبطاً بالسجل المصدر`);
  }
}

export interface CashDrawerSummary {
  openingBalance: number;
  income: number;
  out: number;
  balance: number;
}

export function calculateCashDrawerSummary(transactions: CashTransaction[]): CashDrawerSummary {
  const cashTransactions = transactions.filter((transaction) => transaction.paymentMethod === 'cash');
  const openingBalance = cashTransactions
    .filter((transaction) => transaction.sourceType === 'opening_balance')
    .reduce((sum, transaction) => sum + (transaction.direction === 'in' ? transaction.amount : -transaction.amount), 0);
  const income = cashTransactions
    .filter((transaction) => transaction.direction === 'in' && transaction.sourceType !== 'opening_balance')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const out = cashTransactions
    .filter((transaction) => transaction.direction === 'out' && transaction.sourceType !== 'opening_balance')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  return { openingBalance, income, out, balance: openingBalance + income - out };
}
