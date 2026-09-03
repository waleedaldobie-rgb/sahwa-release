import Database from 'better-sqlite3';
import { parsePaymentLedger } from '../../domain/paymentRules';
import { round2 } from '../../domain/inventoryRules';
import { IssueCollector, nearlyEqual } from './types';

type SqlRow = Record<string, unknown>;

export function checkOrderIntegrity(db: Database.Database, issue: IssueCollector): void {
  const duplicateOrders = db.prepare('SELECT order_number, COUNT(*) AS count FROM orders GROUP BY order_number HAVING COUNT(*) > 1').all() as Array<{ order_number: string; count: number }>;
  for (const row of duplicateOrders) {
    issue({ code: 'DUPLICATE_ORDER_NUMBER', table: 'orders', recordId: row.order_number, expected: 1, actual: row.count, reason: 'Order numbers must be unique and persistent' });
  }

  const invoicesByOrderId = new Map<string, { payments_json?: string }>();
  for (const invoice of db.prepare('SELECT order_id, payments_json FROM invoices').all() as Array<{ order_id: string; payments_json?: string }>) {
    invoicesByOrderId.set(String(invoice.order_id), invoice);
  }

  const orders = db.prepare('SELECT * FROM orders').all() as SqlRow[];
  for (const order of orders) {
    const total = Number(order.total_amount);
    const paid = Number(order.paid_amount);
    const remaining = Number(order.remaining_amount);
    let cashReceived = Number(order.cash_received || 0);
    const invoiceLedger = invoicesByOrderId.get(String(order.id));
    let hasNonCashCustomerCredit = false;
    if (invoiceLedger) {
      try {
        const payments = parsePaymentLedger(typeof invoiceLedger.payments_json === 'string' ? invoiceLedger.payments_json : undefined);
        hasNonCashCustomerCredit = payments.some((payment) => payment.method === 'customer_credit');
        if (cashReceived <= 0 && paid > 0) {
          cashReceived = round2(payments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0));
        }
      } catch {
        // The invoice loop below reports invalid payment JSON with full record context.
      }
    }
    const overpayment = Number(order.overpayment_amount || 0);
    const writeoff = Number(order.cancellation_writeoff_amount || 0);
    const expectedRemaining = Math.max(0, total - paid - writeoff);
    if (!Number.isFinite(total) || total < 0) issue({ code: 'INVALID_ORDER_AMOUNT', table: 'orders', recordId: String(order.id), field: 'total_amount', expected: '>= 0', actual: total, reason: 'Order total is negative or non-numeric' });
    if (!Number.isFinite(paid) || paid < 0) issue({ code: 'INVALID_ORDER_AMOUNT', table: 'orders', recordId: String(order.id), field: 'paid_amount', expected: '>= 0', actual: paid, reason: 'Order paid amount is negative or non-numeric' });
    if (!Number.isFinite(writeoff) || writeoff < 0) issue({ code: 'INVALID_WRITEOFF', table: 'orders', recordId: String(order.id), field: 'cancellation_writeoff_amount', expected: '>= 0', actual: writeoff, reason: 'Cancellation writeoff must be non-negative' });
    if (writeoff > 0 && order.status !== 'cancelled') issue({ code: 'WRITEOFF_ON_ACTIVE_ORDER', table: 'orders', recordId: String(order.id), field: 'cancellation_writeoff_amount', expected: 0, actual: writeoff, reason: 'Cancellation writeoff is only valid on cancelled orders', severity: 'critical' });
    if (Number.isFinite(total) && Number.isFinite(paid) && paid > total + 0.0001) issue({ code: 'ORDER_APPLIED_OVER_TOTAL', table: 'orders', recordId: String(order.id), field: 'paid_amount', expected: `<= ${total}`, actual: paid, reason: 'Applied paid amount cannot exceed invoice total' });
    const cashFloor = hasNonCashCustomerCredit ? 0 : paid;
    if (!Number.isFinite(cashReceived) || cashReceived + 0.0001 < cashFloor) issue({ code: 'ORDER_CASH_BELOW_APPLIED', table: 'orders', recordId: String(order.id), field: 'cash_received', expected: `>= ${cashFloor}`, actual: cashReceived, reason: 'Cash received cannot be below applied paid amount unless settlement is customer_credit' });
    const expectedOverpayment = Math.max(0, cashReceived - total);
    if (!Number.isFinite(overpayment) || !nearlyEqual(overpayment, expectedOverpayment)) issue({ code: 'ORDER_OVERPAYMENT_MISMATCH', table: 'orders', recordId: String(order.id), field: 'overpayment_amount', expected: expectedOverpayment, actual: overpayment, reason: 'Overpayment must equal cash received above invoice total' });
    if (Number.isFinite(total) && Number.isFinite(paid) && (!Number.isFinite(remaining) || !nearlyEqual(remaining, expectedRemaining))) issue({ code: 'ORDER_REMAINING_MISMATCH', table: 'orders', recordId: String(order.id), field: 'remaining_amount', expected: expectedRemaining, actual: remaining, reason: 'Invoice total must equal applied paid plus remaining plus cancellation writeoff' });
    if (order.status === 'cancelled' && remaining > 0.0001) issue({ code: 'CANCELLED_ORDER_UNSETTLED', table: 'orders', recordId: String(order.id), field: 'remaining_amount', expected: 0, actual: remaining, reason: 'Cancelled order must be paid or settled by cancellation writeoff', severity: 'critical' });
    if (!Number.isInteger(Number(order.garment_count)) || Number(order.garment_count) < 1) issue({ code: 'INVALID_GARMENT_COUNT', table: 'orders', recordId: String(order.id), field: 'garment_count', expected: 'integer >= 1', actual: order.garment_count, reason: 'Garment count is not a positive integer' });
    if (Number(order.fabric_consumption_meters) < 0) issue({ code: 'NEGATIVE_CONSUMPTION', table: 'orders', recordId: String(order.id), field: 'fabric_consumption_meters', expected: '>= 0', actual: order.fabric_consumption_meters, reason: 'Order consumption cannot be negative' });
  }
}
