import Database from 'better-sqlite3';
import { assertValidCashSourceType } from '../../domain/cashRules';
import { IssueCollector, nearlyEqual } from './types';

type SqlRow = Record<string, unknown>;

export function checkCashIntegrity(db: Database.Database, issue: IssueCollector): void {
  const cashTransactions = db.prepare('SELECT * FROM cash_transactions').all() as SqlRow[];
  for (const cash of cashTransactions) {
    try {
      const sourceType = assertValidCashSourceType(cash.source_type);
      const isManual = ['opening_balance', 'adjustment', 'withdrawal'].includes(sourceType);
      const isRefund = sourceType === 'customer_refund' || sourceType === 'customer_credit_refund';
      if ((isManual || isRefund) && (!String(cash.actor_id || '').trim() || !String(cash.reason || '').trim())) {
        issue({ code: 'CASH_AUDIT_METADATA_MISSING', table: 'cash_transactions', recordId: String(cash.id), field: 'actor_id/reason', expected: 'non-empty actor_id and reason', actual: { actorId: cash.actor_id, reason: cash.reason }, reason: 'Cash movement is missing required audit metadata', severity: 'high' });
      }
      if ((sourceType === 'adjustment' || sourceType === 'withdrawal') && !String(cash.reason || '').trim()) {
        issue({ code: 'CASH_REASON_MISSING', table: 'cash_transactions', recordId: String(cash.id), field: 'reason', expected: 'non-empty reason', actual: cash.reason, reason: 'Adjustment or withdrawal requires a reason', severity: 'high' });
      }
      if (isRefund && (cash.direction !== 'out' || cash.payment_method !== 'cash' || !String(cash.source_id || '').trim())) {
        issue({ code: 'INVALID_CUSTOMER_REFUND_CASH', table: 'cash_transactions', recordId: String(cash.id), expected: 'out/cash/linked source_id', actual: cash, reason: 'Customer refund cash movement is not correctly linked', severity: 'critical' });
      }
      if (sourceType === 'customer_payment' && (cash.direction !== 'in' || !String(cash.source_id || '').trim())) {
        issue({ code: 'INVALID_CUSTOMER_PAYMENT_CASH', table: 'cash_transactions', recordId: String(cash.id), expected: 'in with source_id', actual: cash, reason: 'Customer payment cash movement is not linked to a payment', severity: 'critical' });
      }
      if ((sourceType === 'purchase' || sourceType === 'expense') && (cash.direction !== 'out' || !String(cash.source_id || '').trim())) {
        issue({ code: 'INVALID_BUSINESS_CASH_SOURCE', table: 'cash_transactions', recordId: String(cash.id), expected: 'out with source_id', actual: cash, reason: 'Business-originated cash movement is not linked to its source record', severity: 'critical' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Cash source type is not allowed';
      issue({ code: 'CASH_SOURCE_NOT_WHITELISTED', table: 'cash_transactions', recordId: String(cash.id), field: 'source_type', expected: 'approved Cash Drawer source type', actual: cash.source_type, reason: message, severity: 'critical' });
    }
  }

  const expenseCash = new Map<string, { total: number; count: number }>();
  for (const row of db.prepare(`
    SELECT source_id, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM cash_transactions
    WHERE source_type = 'expense' AND direction = 'out'
    GROUP BY source_id
  `).all() as Array<{ source_id: string; total: number; count: number }>) {
    expenseCash.set(String(row.source_id), { total: Number(row.total), count: Number(row.count) });
  }
  const expenses = db.prepare('SELECT * FROM expenses').all() as SqlRow[];
  for (const expense of expenses) {
    const cash = expenseCash.get(String(expense.id)) || { total: 0, count: 0 };
    if (Number(cash.count) === 0) issue({ code: 'MISSING_EXPENSE_CASH', table: 'expenses', recordId: String(expense.id), field: 'cash_ledger', expected: 'matching expense cash outflow', actual: null, reason: 'Expense has no matching cash ledger entry', severity: 'critical' });
    else if (!nearlyEqual(Number(cash.total), Number(expense.amount))) issue({ code: 'EXPENSE_CASH_MISMATCH', table: 'expenses', recordId: String(expense.id), field: 'cash_ledger.amount', expected: expense.amount, actual: cash.total, reason: 'Expense cash ledger does not match expense amount', severity: 'critical' });
  }

  const purchaseLineTotals = new Map<string, number>();
  for (const row of db.prepare('SELECT purchase_id, COALESCE(SUM(total_amount), 0) AS total FROM purchase_lines GROUP BY purchase_id').all() as Array<{ purchase_id: string; total: number }>) {
    purchaseLineTotals.set(String(row.purchase_id), Number(row.total));
  }
  const purchaseCash = new Map<string, { total: number; count: number }>();
  for (const row of db.prepare(`
    SELECT source_id, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM cash_transactions
    WHERE source_type = 'purchase' AND direction = 'out'
    GROUP BY source_id
  `).all() as Array<{ source_id: string; total: number; count: number }>) {
    purchaseCash.set(String(row.source_id), { total: Number(row.total), count: Number(row.count) });
  }
  const purchases = db.prepare('SELECT * FROM purchases').all() as SqlRow[];
  for (const purchase of purchases) {
    const lineTotal = purchaseLineTotals.get(String(purchase.id)) || 0;
    if (!nearlyEqual(Number(purchase.total_amount), lineTotal)) issue({ code: 'PURCHASE_TOTAL_MISMATCH', table: 'purchases', recordId: String(purchase.id), field: 'total_amount', expected: lineTotal, actual: purchase.total_amount, reason: 'Purchase total differs from its line totals' });
    const cash = purchaseCash.get(String(purchase.id)) || { total: 0, count: 0 };
    if (Number(cash.count) === 0) issue({ code: 'MISSING_PURCHASE_CASH', table: 'purchases', recordId: String(purchase.id), field: 'cash_ledger', expected: 'matching purchase cash outflow', actual: null, reason: 'Purchase has no matching cash ledger entry', severity: 'critical' });
    else if (!nearlyEqual(Number(cash.total), Number(purchase.total_amount))) issue({ code: 'PURCHASE_CASH_MISMATCH', table: 'purchases', recordId: String(purchase.id), field: 'cash_ledger.amount', expected: purchase.total_amount, actual: cash.total, reason: 'Purchase cash ledger does not match purchase total', severity: 'critical' });
  }
}
