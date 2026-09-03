import { AppData, CashTransaction, ExpenseRecord } from '../../types';
import { normalizePositiveAmount } from '../../domain/amountRules';
import { assertValidPaymentMethod } from '../../domain/paymentRules';
import { createSafeId } from '../../domain/idGenerator';
import { round2 } from '../../domain/inventoryRules';
import { assertCashTransactionContract, assertValidManualCashSourceType } from '../../domain/cashRules';
import { findById, hasIdOrSourceId } from '../shared/idempotencyRules';

type DraftPayload = Record<string, any>;

export function applyExpenseToDraft(draft: AppData, payload: DraftPayload): ExpenseRecord {
  const id = payload.id || createSafeId('EXP');
  const paymentMethod = assertValidPaymentMethod(payload.paymentMethod ?? 'cash');
  const duplicate = findById(draft.expenses, id);
  if (duplicate) return duplicate;
  if (!payload.category?.trim() || !payload.description?.trim()) throw new Error('تصنيف ووصف المصروف مطلوبان');

  const amount = normalizePositiveAmount(payload.amount, 'مبلغ المصروف');
  const now = new Date().toISOString();
  const expense: ExpenseRecord = {
    id,
    category: payload.category.trim(),
    amount: round2(amount),
    expenseDate: payload.expenseDate || now.slice(0, 10),
    paymentMethod,
    description: payload.description.trim(),
    notes: payload.notes || undefined,
    createdAt: now
  };
  draft.expenses = [expense, ...(draft.expenses || [])];
  insertCash(draft, {
    id: `CASH-EXP-${id}`,
    direction: 'out',
    sourceType: 'expense',
    sourceId: id,
    referenceNumber: id,
    amount: expense.amount,
    paymentMethod: expense.paymentMethod,
    transactionDate: expense.expenseDate,
    description: expense.description,
    notes: expense.notes,
    actorId: 'system',
    reason: expense.description,
    createdAt: now
  });
  return expense;
}

export function applyCashAdjustmentToDraft(draft: AppData, payload: DraftPayload): CashTransaction {
  const amount = normalizePositiveAmount(payload.amount, 'مبلغ الحركة');
  const paymentMethod = assertValidPaymentMethod(payload.paymentMethod ?? 'cash');
  if (!payload.description?.trim()) throw new Error('وصف الحركة المالية مطلوب');

  const id = payload.id || createSafeId('CASH');
  const duplicate = findById(draft.cashTransactions, id);
  if (duplicate) return duplicate;

  const transaction: CashTransaction = {
    id,
    direction: payload.direction === 'out' ? 'out' : 'in',
    sourceType: assertValidManualCashSourceType(payload.sourceType || 'adjustment'),
    sourceId: payload.sourceId,
    referenceNumber: payload.referenceNumber,
    amount: round2(amount),
    paymentMethod,
    transactionDate: payload.transactionDate || new Date().toISOString().slice(0, 10),
    description: payload.description.trim(),
    notes: payload.notes,
    actorId: payload.actorId || 'system',
    reason: payload.reason?.trim() || payload.description.trim(),
    createdAt: new Date().toISOString()
  };
  insertCash(draft, transaction);
  return transaction;
}

function insertCash(draft: AppData, transaction: CashTransaction): void {
  assertCashTransactionContract(transaction);
  if (hasIdOrSourceId(draft.cashTransactions, transaction.id, transaction.sourceId)) return;
  draft.cashTransactions = [transaction, ...(draft.cashTransactions || [])];
}
