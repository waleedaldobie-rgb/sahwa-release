import Database from 'better-sqlite3';
import { parsePaymentLedger, summarizePaymentLedger } from '../../domain/paymentRules';
import { round2 } from '../../domain/inventoryRules';
import { IssueCollector, nearlyEqual } from './types';

type SqlRow = Record<string, unknown>;

export function checkInvoiceIntegrity(db: Database.Database, issue: IssueCollector): void {
  const duplicateInvoices = db.prepare('SELECT order_id, COUNT(*) AS count FROM invoices GROUP BY order_id HAVING COUNT(*) > 1').all() as Array<{ order_id: string; count: number }>;
  for (const row of duplicateInvoices) {
    issue({ code: 'DUPLICATE_INVOICE_ORDER', table: 'invoices', recordId: row.order_id, expected: 1, actual: row.count, reason: 'The configured business rule allows one invoice per order' });
  }

  const ordersById = new Map<string, SqlRow>();
  for (const order of db.prepare('SELECT id, total_amount, paid_amount, remaining_amount, status, customer_id, cancellation_writeoff_amount FROM orders').all() as SqlRow[]) {
    ordersById.set(String(order.id), order);
  }

  const cashByOrderId = new Map<string, number>();
  for (const cash of db.prepare(`SELECT order_id, COALESCE(SUM(amount), 0) AS total FROM cash_transactions WHERE source_type = 'customer_payment' AND direction = 'in' GROUP BY order_id`).all() as Array<{ order_id: string; total: number }>) {
    cashByOrderId.set(String(cash.order_id), Number(cash.total));
  }

  const createdCreditsByInvoice = new Map<string, number>();
  for (const credit of db.prepare(`SELECT invoice_id, COALESCE(SUM(amount), 0) AS total FROM customer_credits WHERE entry_type = 'created' GROUP BY invoice_id`).all() as Array<{ invoice_id: string; total: number }>) {
    createdCreditsByInvoice.set(String(credit.invoice_id), Number(credit.total));
  }

  const invoices = db.prepare('SELECT * FROM invoices').all() as SqlRow[];
  for (const invoice of invoices) {
    try {
      const payments = parsePaymentLedger(typeof invoice.payments_json === 'string' ? invoice.payments_json : undefined);
      const expected = summarizePaymentLedger(payments, invoice.total_amount);
      const writeoff = Number(invoice.cancellation_writeoff_amount || 0);
      const ledgerCashReceived = round2(payments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0));
      const storedCashReceived = Number(invoice.cash_received || 0);
      const cashReceived = storedCashReceived > 0 ? storedCashReceived : ledgerCashReceived;
      const expectedOverpayment = Math.max(0, ledgerCashReceived - Number(invoice.total_amount));
      const expectedRemaining = Math.max(0, expected.remainingAmount - writeoff);
      if (!nearlyEqual(Number(invoice.paid_amount), expected.paidAmount)) issue({ code: 'INVOICE_PAYMENT_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'paid_amount', expected: expected.paidAmount, actual: invoice.paid_amount, reason: 'Invoice paid amount differs from payment ledger' });
      if (!nearlyEqual(Number(invoice.remaining_amount), expectedRemaining)) issue({ code: 'INVOICE_REMAINING_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'remaining_amount', expected: expectedRemaining, actual: invoice.remaining_amount, reason: 'Invoice total must equal applied paid plus remaining plus cancellation writeoff' });
      if (storedCashReceived > 0 && !nearlyEqual(storedCashReceived, ledgerCashReceived)) issue({ code: 'INVOICE_CASH_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'cash_received', expected: ledgerCashReceived, actual: invoice.cash_received, reason: 'Invoice cash received differs from payment ledger' });
      if (!nearlyEqual(Number(invoice.overpayment_amount || 0), expectedOverpayment)) issue({ code: 'INVOICE_OVERPAYMENT_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'overpayment_amount', expected: expectedOverpayment, actual: invoice.overpayment_amount, reason: 'Invoice overpayment differs from cash received above invoice total' });
      const order = ordersById.get(String(invoice.order_id));
      const expectedStatus = order?.status === 'cancelled' && writeoff > 0 ? 'settled_by_cancellation' : expectedRemaining <= 0.0001 ? 'paid' : expected.paymentStatus;
      if (invoice.payment_status !== expectedStatus) issue({ code: 'INVOICE_STATUS_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'payment_status', expected: expectedStatus, actual: invoice.payment_status, reason: 'Invoice payment status differs from the settlement contract' });
      if (!order) issue({ code: 'ORPHAN_INVOICE', table: 'invoices', recordId: String(invoice.id), expected: 'existing order', actual: invoice.order_id, reason: 'Invoice references a missing order' });
      else {
        if (!nearlyEqual(Number(invoice.total_amount), Number(order.total_amount))) issue({ code: 'INVOICE_ORDER_TOTAL_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'total_amount', expected: order.total_amount, actual: invoice.total_amount, reason: 'Invoice total differs from order total' });
        if (!nearlyEqual(Number(invoice.paid_amount), Number(order.paid_amount))) issue({ code: 'INVOICE_ORDER_PAID_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'paid_amount', expected: order.paid_amount, actual: invoice.paid_amount, reason: 'Invoice paid differs from order paid' });
        if (!nearlyEqual(Number(invoice.remaining_amount), Number(order.remaining_amount))) issue({ code: 'INVOICE_ORDER_REMAINING_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'remaining_amount', expected: order.remaining_amount, actual: invoice.remaining_amount, reason: 'Invoice remaining differs from order remaining' });
        if (!nearlyEqual(Number(invoice.cancellation_writeoff_amount || 0), Number(order.cancellation_writeoff_amount || 0))) issue({ code: 'INVOICE_ORDER_WRITEOFF_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'cancellation_writeoff_amount', expected: order.cancellation_writeoff_amount, actual: invoice.cancellation_writeoff_amount, reason: 'Invoice writeoff differs from order writeoff' });
      }
      const cashTotal = cashByOrderId.get(String(invoice.order_id)) || 0;
      if (!nearlyEqual(cashTotal, cashReceived)) issue({ code: 'PAYMENT_CASH_MISMATCH', table: 'cash_transactions', recordId: String(invoice.order_id), field: 'amount', expected: cashReceived, actual: cashTotal, reason: 'Customer payment cash ledger does not match cash received in payment ledger' });
      const createdCredits = createdCreditsByInvoice.get(String(invoice.id)) || 0;
      if (!nearlyEqual(createdCredits, expectedOverpayment)) issue({ code: 'CUSTOMER_CREDIT_MISMATCH', table: 'customer_credits', recordId: String(invoice.id), field: 'amount', expected: expectedOverpayment, actual: createdCredits, reason: 'Customer credit created ledger does not match invoice overpayment liability', severity: 'critical' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      issue({ code: 'INVALID_PAYMENT_LEDGER', table: 'invoices', recordId: String(invoice.id), field: 'payments_json', expected: 'valid unique payment records', actual: message, reason: 'Invoice payment JSON cannot be reconciled' });
    }
  }
}
