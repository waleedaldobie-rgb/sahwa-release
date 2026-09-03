import { assertValidPaymentMethod, summarizePaymentLedger } from '../../domain/paymentRules';
import { round2 } from '../../domain/inventoryRules';
import { assertValidOrderStatus } from '../../domain/orderRules';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { BACKUP_SCHEMA_VERSION, IntegrityIssue, IntegrityReport, createIssueCollector, nearlyEqual } from './types';

type RestoreRow = Record<string, unknown>;

function asRows(value: unknown): RestoreRow[] {
  return Array.isArray(value) ? value as RestoreRow[] : [];
}

export function validateRestorePayload(payload: unknown): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const add = createIssueCollector(issues);
  const root = payload as RestoreRow | null;
  if (!payload || typeof payload !== 'object') add({ code: 'INVALID_BACKUP_ROOT', table: 'backup', expected: 'object', actual: typeof payload, reason: 'Backup root must be an object', severity: 'critical' });
  const backupVersion = root?.backupSchemaVersion ?? 1;
  if (backupVersion !== 1 && backupVersion !== BACKUP_SCHEMA_VERSION) {
    add({ code: 'UNSUPPORTED_BACKUP_SCHEMA', table: 'backup', field: 'backupSchemaVersion', expected: [1, BACKUP_SCHEMA_VERSION], actual: backupVersion, reason: 'Backup schema version is not supported', severity: 'critical' });
  }
  if (root?.backupSchemaVersion === BACKUP_SCHEMA_VERSION && root?.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    add({ code: 'SCHEMA_VERSION_MISMATCH', table: 'backup', field: 'schemaVersion', expected: CURRENT_SCHEMA_VERSION, actual: root?.schemaVersion, reason: 'Backup database schema does not match the application schema', severity: 'critical' });
  }
  const required = ['customers', 'fabrics', 'accessories', 'thobeTypes', 'colors', 'orders', 'invoices', 'notifications', 'stockMovements', 'purchases', 'expenses', 'cashTransactions', 'orderMaterialUsages', 'orderEvents'];
  if (root?.backupSchemaVersion === BACKUP_SCHEMA_VERSION) required.push('customerCredits');
  for (const key of required) if (!Array.isArray(root?.[key])) add({ code: 'MISSING_COLLECTION', table: 'backup', field: key, expected: 'array', actual: typeof root?.[key], reason: 'Required operational collection is missing', severity: 'critical' });
  if (issues.length > 0) return { ok: false, checkedAt: new Date().toISOString(), issues };

  const ids = new Map<string, string>();
  const collect = (table: string, rows: RestoreRow[]) => {
    for (const row of rows) {
      if (!row?.id) { add({ code: 'MISSING_ID', table, expected: 'id', actual: row, reason: 'Record has no stable id' }); continue; }
      const key = String(row.id);
      const previous = ids.get(`${table}:${key}`);
      if (previous) add({ code: 'DUPLICATE_ID', table, recordId: key, expected: 'unique id', actual: key, reason: `Duplicate id in ${table}` });
      ids.set(`${table}:${key}`, table);
    }
  };
  for (const key of required) collect(key, asRows(root?.[key]));
  const customerCredits = asRows(root?.customerCredits);
  const appliedCreditByOperation = new Map<string, { amount: number; invoiceId: string; entries: RestoreRow[] }>();
  for (const credit of customerCredits) {
    if (credit.entryType !== 'applied' || !credit.operationId) continue;
    const invoiceId = String(credit.targetInvoiceId || credit.invoiceId || '');
    const key = `${String(credit.operationId)}:${invoiceId}`;
    const current = appliedCreditByOperation.get(key) || { amount: 0, invoiceId, entries: [] };
    current.amount = round2(current.amount + Number(credit.amount || 0));
    current.entries.push(credit);
    appliedCreditByOperation.set(key, current);
  }

  const invoices = asRows(root?.invoices);
  const orders = asRows(root?.orders);
  const customers = asRows(root?.customers);
  const fabrics = asRows(root?.fabrics);
  const accessories = asRows(root?.accessories);
  const stockMovements = asRows(root?.stockMovements);
  const orderMaterialUsages = asRows(root?.orderMaterialUsages);
  const cashTransactions = asRows(root?.cashTransactions);
  const purchases = asRows(root?.purchases);
  const expenses = asRows(root?.expenses);
  const orderEvents = asRows(root?.orderEvents);
  const notifications = asRows(root?.notifications);

  const orderNumbers = new Set<string>();
  const invoiceByOrderId = new Map<string, RestoreRow>(invoices.map((invoice) => [String(invoice.orderId), invoice]));
  const ordersById = new Map<string, RestoreRow>(orders.map((order) => [String(order.id), order]));
  const customersById = new Map<string, RestoreRow>(customers.map((customer) => [String(customer.id), customer]));
  const fabricsById = new Map<string, RestoreRow>(fabrics.map((fabric) => [String(fabric.id), fabric]));
  const accessoriesById = new Map<string, RestoreRow>(accessories.map((accessory) => [String(accessory.id), accessory]));
  const invoicesById = new Map<string, RestoreRow>(invoices.map((invoice) => [String(invoice.id), invoice]));
  for (const order of orders) {
    if (orderNumbers.has(String(order.orderNumber))) add({ code: 'DUPLICATE_ORDER_NUMBER', table: 'orders', recordId: String(order.id), expected: 'unique order number', actual: order.orderNumber, reason: 'Backup contains duplicate order number', severity: 'critical' });
    orderNumbers.add(String(order.orderNumber));
    try {
      const status = assertValidOrderStatus(order.status);
      const amounts = summarizePaymentLedger([], order.totalAmount);
      const paid = Number(order.paidAmount);
      const remaining = Number(order.remainingAmount);
      const writeoff = Number(order.cancellationWriteoffAmount || 0);
      const cashReceived = Number(order.cashReceived ?? paid);
      const expectedRemaining = Math.max(0, amounts.totalAmount - paid - writeoff);
      const invoice = invoiceByOrderId.get(String(order.id));
      const invoicePayments = Array.isArray(invoice?.payments) ? invoice.payments as RestoreRow[] : [];
      const hasNonCashCustomerCredit = invoicePayments.some((payment) => payment.method === 'customer_credit');
      const cashFloor = hasNonCashCustomerCredit ? 0 : paid;
      if (!Number.isFinite(paid) || paid < 0 || paid > amounts.totalAmount + 0.0001 || !Number.isFinite(writeoff) || writeoff < 0 || (writeoff > 0 && status !== 'cancelled') || !Number.isFinite(remaining) || !nearlyEqual(remaining, expectedRemaining) || (status === 'cancelled' && remaining > 0.0001) || !Number.isFinite(cashReceived) || cashReceived + 0.0001 < cashFloor || !nearlyEqual(Number(order.overpaymentAmount || 0), Math.max(0, cashReceived - amounts.totalAmount))) add({ code: 'INVALID_ORDER_PAYMENT', table: 'orders', recordId: String(order.id), expected: { paid: `0..${amounts.totalAmount}`, remaining: expectedRemaining, cashReceived: `>= ${cashFloor}`, writeoff: 'only when cancelled' }, actual: { paid, remaining, cashReceived, writeoff, overpaymentAmount: order.overpaymentAmount }, reason: 'Backup order settlement aggregate is invalid' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      add({ code: 'INVALID_ORDER_AMOUNT_OR_STATUS', table: 'orders', recordId: String(order.id), expected: 'valid amount and status', actual: message, reason: 'Backup order amount or status is invalid', severity: 'critical' });
    }
    if (!customersById.has(String(order.customerId))) add({ code: 'ORPHAN_ORDER_CUSTOMER', table: 'orders', recordId: String(order.id), expected: order.customerId, actual: null, reason: 'Order customer is missing from backup', severity: 'critical' });
    if (order.fabricId && !fabricsById.has(String(order.fabricId))) add({ code: 'ORPHAN_ORDER_FABRIC', table: 'orders', recordId: String(order.id), expected: order.fabricId, actual: null, reason: 'Order fabric is missing from backup', severity: 'critical' });
  }

  const invoiceOrderIds = new Set<string>();
  const invoicesByOrder = new Map<string, RestoreRow>();
  for (const invoice of invoices) {
    if (invoiceOrderIds.has(String(invoice.orderId))) add({ code: 'DUPLICATE_INVOICE_ORDER', table: 'invoices', recordId: String(invoice.id), expected: 'one invoice per order', actual: invoice.orderId, reason: 'Backup contains multiple invoices for one order' });
    invoiceOrderIds.add(String(invoice.orderId));
    invoicesByOrder.set(String(invoice.orderId), invoice);
    if (!ordersById.has(String(invoice.orderId))) add({ code: 'ORPHAN_INVOICE', table: 'invoices', recordId: String(invoice.id), expected: invoice.orderId, actual: null, reason: 'Invoice order is missing from backup' });
    try {
      if (!Array.isArray(invoice.payments)) {
        add({ code: 'MISSING_PAYMENT_LEDGER', table: 'invoices', recordId: String(invoice.id), field: 'payments', expected: 'array', actual: typeof invoice.payments, reason: 'Invoice payment ledger is missing', severity: 'critical' });
        continue;
      }
      const payments = invoice.payments as RestoreRow[];
      const expected = summarizePaymentLedger(payments as never, invoice.totalAmount);
      const writeoff = Number(invoice.cancellationWriteoffAmount || 0);
      const cashReceived = payments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0);
      const expectedRemaining = Math.max(0, expected.remainingAmount - writeoff);
      const expectedOverpayment = Math.max(0, cashReceived - Number(invoice.totalAmount));
      const order = ordersById.get(String(invoice.orderId));
      const expectedStatus = order?.status === 'cancelled' && writeoff > 0 ? 'settled_by_cancellation' : expectedRemaining <= 0.0001 ? 'paid' : expected.paymentStatus;
      if (!nearlyEqual(Number(invoice.paidAmount), expected.paidAmount) || !nearlyEqual(Number(invoice.remainingAmount), expectedRemaining) || !nearlyEqual(Number(invoice.cashReceived ?? 0), cashReceived) || !nearlyEqual(Number(invoice.overpaymentAmount || 0), expectedOverpayment)) add({ code: 'INVOICE_PAYMENT_MISMATCH', table: 'invoices', recordId: String(invoice.id), expected: { paid: expected.paidAmount, remaining: expectedRemaining, cashReceived, overpaymentAmount: expectedOverpayment }, actual: { paid: invoice.paidAmount, remaining: invoice.remainingAmount, cashReceived: invoice.cashReceived, overpaymentAmount: invoice.overpaymentAmount }, reason: 'Backup invoice settlement aggregates do not match the Invoice Payment Ledger', severity: 'critical' });
      if (invoice.paymentStatus !== expectedStatus) add({ code: 'INVOICE_STATUS_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'paymentStatus', expected: expectedStatus, actual: invoice.paymentStatus, reason: 'Backup invoice payment status differs from the settlement contract', severity: 'critical' });
      if (order && !nearlyEqual(Number(order.totalAmount), Number(invoice.totalAmount))) add({ code: 'INVOICE_ORDER_TOTAL_MISMATCH', table: 'invoices', recordId: String(invoice.id), expected: order.totalAmount, actual: invoice.totalAmount, reason: 'Invoice total differs from its order total', severity: 'critical' });
      if (order && (!nearlyEqual(Number(order.paidAmount), expected.paidAmount) || !nearlyEqual(Number(order.remainingAmount), expectedRemaining) || !nearlyEqual(Number(order.cancellationWriteoffAmount || 0), writeoff))) add({ code: 'ORDER_PAYMENT_PROJECTION_MISMATCH', table: 'orders', recordId: String(order.id), expected: { paid: expected.paidAmount, remaining: expectedRemaining, writeoff, source: 'invoice.paymentLedger' }, actual: { paid: order.paidAmount, remaining: order.remainingAmount, writeoff: order.cancellationWriteoffAmount }, reason: 'Order payment projections do not match the Invoice Settlement Ledger', severity: 'critical' });
      for (const payment of payments) {
        if (payment.method !== 'customer_credit') {
          assertValidPaymentMethod(payment.method);
          continue;
        }
        const operationId = String(payment.id || '').replace(/-PAYMENT$/, '');
        const key = `${operationId}:${String(payment.invoiceId || invoice.id)}`;
        const matchingCredit = appliedCreditByOperation.get(key);
        if (!matchingCredit) {
          add({ code: 'MISSING_CUSTOMER_CREDIT_LEDGER', table: 'invoices', recordId: String(invoice.id), field: 'payments', expected: `customer_credits applied entry for ${operationId}`, actual: payment, reason: 'Customer credit payment has no matching applied customer credit ledger entry', severity: 'critical' });
        } else if (!nearlyEqual(matchingCredit.amount, Number(payment.amount))) {
          add({ code: 'CUSTOMER_CREDIT_PAYMENT_MISMATCH', table: 'invoices', recordId: String(invoice.id), field: 'payments.amount', expected: matchingCredit.amount, actual: payment.amount, reason: 'Customer credit payment amount differs from applied customer credit ledger amount', severity: 'critical' });
        }
        if (!nearlyEqual(Number(payment.cashReceived || 0), 0) || !nearlyEqual(Number(payment.overpaymentAmount || 0), 0)) {
          add({ code: 'CUSTOMER_CREDIT_CASH_LEAK', table: 'invoices', recordId: String(invoice.id), field: 'payments.cashReceived', expected: 0, actual: { cashReceived: payment.cashReceived, overpaymentAmount: payment.overpaymentAmount }, reason: 'Customer credit payment must not create cash or overpayment movement', severity: 'critical' });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      add({ code: 'INVALID_PAYMENT_LEDGER', table: 'invoices', recordId: String(invoice.id), expected: 'valid payments with supported methods', actual: message, reason: 'Backup invoice payments are invalid', severity: 'critical' });
    }
  }
  const creditCreatedByInvoice = new Map<string, number>();
  const creditPaymentIds = new Set<string>();
  for (const credit of customerCredits) {
    const amount = Number(credit.amount);
    const customer = customersById.get(String(credit.customerId));
    const invoice = invoicesById.get(String(credit.invoiceId));
    if (!customer) add({ code: 'ORPHAN_CUSTOMER_CREDIT', table: 'customerCredits', recordId: String(credit.id), expected: credit.customerId, actual: null, reason: 'Customer credit references a missing customer', severity: 'critical' });
    if (!['created', 'applied', 'refunded'].includes(String(credit.entryType))) add({ code: 'INVALID_CUSTOMER_CREDIT_TYPE', table: 'customerCredits', recordId: String(credit.id), field: 'entryType', expected: ['created', 'applied', 'refunded'], actual: credit.entryType, reason: 'Customer credit entry type is invalid', severity: 'critical' });
    if (!Number.isFinite(amount) || amount < 0) add({ code: 'INVALID_CUSTOMER_CREDIT_AMOUNT', table: 'customerCredits', recordId: String(credit.id), field: 'amount', expected: '>= 0', actual: credit.amount, reason: 'Customer credit amount is invalid', severity: 'critical' });
    if (credit.invoiceId && !invoice) add({ code: 'ORPHAN_CUSTOMER_CREDIT_INVOICE', table: 'customerCredits', recordId: String(credit.id), expected: credit.invoiceId, actual: null, reason: 'Customer credit references a missing invoice', severity: 'critical' });
    if (credit.paymentId) {
      const key = `${credit.paymentId}:${credit.entryType}`;
      if (creditPaymentIds.has(key)) add({ code: 'DUPLICATE_CUSTOMER_CREDIT_PAYMENT', table: 'customerCredits', recordId: String(credit.id), expected: 'one entry per payment and type', actual: key, reason: 'Customer credit ledger contains a duplicate payment entry', severity: 'critical' });
      creditPaymentIds.add(key);
    }
    if (credit.entryType === 'created' && credit.invoiceId) creditCreatedByInvoice.set(String(credit.invoiceId), (creditCreatedByInvoice.get(String(credit.invoiceId)) || 0) + amount);
  }
  for (const invoice of invoices) {
    const payments = Array.isArray(invoice.payments) ? invoice.payments as RestoreRow[] : [];
    const cashReceived = payments.reduce((sum, payment) => sum + Number(payment.cashReceived ?? payment.amount), 0);
    const expectedOverpayment = Math.max(0, cashReceived - Number(invoice.totalAmount));
    const createdCredit = creditCreatedByInvoice.get(String(invoice.id)) || 0;
    if (!nearlyEqual(createdCredit, expectedOverpayment)) add({ code: 'CUSTOMER_CREDIT_MISMATCH', table: 'customerCredits', recordId: String(invoice.id), expected: expectedOverpayment, actual: createdCredit, reason: 'Customer credit creation ledger does not match invoice overpayment liability', severity: 'critical' });
  }
  for (const order of orders) {
    if (!invoicesByOrder.has(String(order.id))) add({ code: 'MISSING_ORDER_INVOICE', table: 'orders', recordId: String(order.id), expected: 'one invoice per order', actual: null, reason: 'Order has no Invoice record in the backup; payment truth cannot be reconstructed', severity: 'critical' });
  }
  for (const fabric of fabrics) if (!Number.isFinite(Number(fabric.quantityMeters)) || Number(fabric.quantityMeters) < 0) add({ code: 'NEGATIVE_STOCK', table: 'fabrics', recordId: String(fabric.id), expected: '>= 0', actual: fabric.quantityMeters, reason: 'Backup fabric quantity is negative', severity: 'critical' });
  for (const accessory of accessories) if (!Number.isFinite(Number(accessory.quantity)) || Number(accessory.quantity) < 0) add({ code: 'NEGATIVE_STOCK', table: 'accessories', recordId: String(accessory.id), expected: '>= 0', actual: accessory.quantity, reason: 'Backup accessory quantity is negative', severity: 'critical' });

  const movementsById = new Map<string, RestoreRow>();
  for (const movement of stockMovements) {
    if (movementsById.has(String(movement.id))) add({ code: 'DUPLICATE_MOVEMENT_ID', table: 'stockMovements', recordId: String(movement.id), expected: 'unique id', actual: movement.id, reason: 'Backup contains duplicate inventory movement id', severity: 'critical' });
    movementsById.set(String(movement.id), movement);
    const itemExists = movement.itemType === 'fabric' ? fabricsById.has(String(movement.itemId)) : movement.itemType === 'accessory' ? accessoriesById.has(String(movement.itemId)) : false;
    if (!itemExists) add({ code: 'ORPHAN_STOCK_MOVEMENT', table: 'stockMovements', recordId: String(movement.id), expected: `${movement.itemType}:${movement.itemId}`, actual: null, reason: 'Inventory movement points to a missing item', severity: 'critical' });
    const quantity = Number(movement.quantity);
    const before = Number(movement.quantityBefore);
    const after = Number(movement.quantityAfter);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(before) || before < 0 || !Number.isFinite(after) || after < 0) add({ code: 'INVALID_STOCK_MOVEMENT', table: 'stockMovements', recordId: String(movement.id), expected: 'positive quantity and non-negative balances', actual: { quantity, before, after }, reason: 'Inventory movement values are invalid', severity: 'critical' });
    if (movement.direction === 'sale' && !nearlyEqual(after, before - quantity)) add({ code: 'SALE_MOVEMENT_MISMATCH', table: 'stockMovements', recordId: String(movement.id), expected: before - quantity, actual: after, reason: 'Sale movement balance is inconsistent', severity: 'critical' });
    if ((movement.direction === 'purchase' || movement.direction === 'return') && !nearlyEqual(after, before + quantity)) add({ code: 'INBOUND_MOVEMENT_MISMATCH', table: 'stockMovements', recordId: String(movement.id), expected: before + quantity, actual: after, reason: 'Inbound movement balance is inconsistent', severity: 'critical' });
  }

  const movementUsageOwner = new Map<string, string>();
  for (const usage of orderMaterialUsages) {
    const order = ordersById.get(String(usage.orderId));
    const quantity = Number(usage.quantity);
    if (!order) add({ code: 'ORPHAN_MATERIAL_USAGE', table: 'orderMaterialUsages', recordId: String(usage.id), expected: usage.orderId, actual: null, reason: 'Material usage points to a missing order', severity: 'critical' });
    if (!Number.isFinite(quantity) || quantity <= 0) add({ code: 'INVALID_MATERIAL_USAGE', table: 'orderMaterialUsages', recordId: String(usage.id), expected: '> 0', actual: usage.quantity, reason: 'Material usage quantity must be positive', severity: 'critical' });
    if (!Number.isFinite(Number(usage.unitCostAtUsage)) || Number(usage.unitCostAtUsage) < 0 || !nearlyEqual(Number(usage.totalCost), quantity * Number(usage.unitCostAtUsage))) add({ code: 'MATERIAL_COST_MISMATCH', table: 'orderMaterialUsages', recordId: String(usage.id), expected: quantity * Number(usage.unitCostAtUsage), actual: usage.totalCost, reason: 'Material cost is not quantity multiplied by unit cost', severity: 'high' });
    if (!usage.sourceMovementId) {
      if (!order || order.status !== 'cancelled') add({ code: 'MISSING_SOURCE_MOVEMENT', table: 'orderMaterialUsages', recordId: String(usage.id), field: 'sourceMovementId', expected: 'movement id for active usage', actual: null, reason: 'Non-cancelled material usage has no source inventory movement', severity: 'critical' });
      continue;
    }
    const movement = movementsById.get(String(usage.sourceMovementId));
    if (!movement) {
      add({ code: 'MISSING_SOURCE_MOVEMENT', table: 'orderMaterialUsages', recordId: String(usage.id), field: 'sourceMovementId', expected: usage.sourceMovementId, actual: null, reason: 'Material usage references a missing inventory movement', severity: 'critical' });
      continue;
    }
    const owner = movementUsageOwner.get(String(movement.id));
    if (owner && owner !== String(usage.id)) add({ code: 'CONFLICTING_SOURCE_MOVEMENT', table: 'orderMaterialUsages', recordId: String(usage.id), field: 'sourceMovementId', expected: 'one usage per movement', actual: movement.id, reason: `Inventory movement is already used by material usage ${owner}`, severity: 'high' });
    movementUsageOwner.set(String(movement.id), String(usage.id));
    if (movement.itemType !== usage.itemType || String(movement.itemId) !== String(usage.itemId) || movement.direction !== 'sale' || !nearlyEqual(Number(movement.quantity), quantity) || String(movement.referenceId || '') !== String(usage.orderId)) add({ code: 'SOURCE_MOVEMENT_MISMATCH', table: 'orderMaterialUsages', recordId: String(usage.id), field: 'sourceMovementId', expected: { itemType: usage.itemType, itemId: usage.itemId, direction: 'sale', quantity, orderId: usage.orderId }, actual: movement, reason: 'Source inventory movement does not match material usage', severity: 'critical' });
  }

  const cashBySource = new Map<string, RestoreRow>();
  const paymentById = new Map<string, { payment: RestoreRow; invoice: RestoreRow }>();
  for (const invoice of invoices) for (const payment of (Array.isArray(invoice.payments) ? invoice.payments as RestoreRow[] : [])) paymentById.set(String(payment.id), { payment, invoice });
  const expensesById = new Map<string, RestoreRow>(expenses.map((expense) => [String(expense.id), expense]));
  for (const cash of cashTransactions) {
    try { assertValidPaymentMethod(cash.paymentMethod ?? 'cash'); } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      add({ code: 'INVALID_PAYMENT_METHOD', table: 'cashTransactions', recordId: String(cash.id), field: 'paymentMethod', expected: ['cash', 'card', 'transfer'], actual: cash.paymentMethod, reason: message, severity: 'critical' });
    }
    if (!Number.isFinite(Number(cash.amount)) || Number(cash.amount) < 0) add({ code: 'INVALID_CASH_AMOUNT', table: 'cashTransactions', recordId: String(cash.id), field: 'amount', expected: '>= 0', actual: cash.amount, reason: 'Cash transaction amount is invalid', severity: 'critical' });
    if (cash.orderId && !ordersById.has(String(cash.orderId))) add({ code: 'ORPHAN_CASH_ORDER', table: 'cashTransactions', recordId: String(cash.id), expected: cash.orderId, actual: null, reason: 'Cash transaction points to a missing order', severity: 'critical' });
    if (cash.sourceId) cashBySource.set(String(cash.sourceId), cash);
    if (cash.sourceType === 'customer_payment') {
      const payment = paymentById.get(String(cash.sourceId));
      if (!payment || payment.invoice.orderId !== cash.orderId || !nearlyEqual(Number(payment.payment.cashReceived ?? payment.payment.amount), Number(cash.amount))) add({ code: 'PAYMENT_CASH_MISMATCH', table: 'cashTransactions', recordId: String(cash.id), expected: 'matching invoice payment cashReceived', actual: { sourceId: cash.sourceId, orderId: cash.orderId, amount: cash.amount }, reason: 'Customer payment cash transaction has no matching payment ledger entry', severity: 'critical' });
    }
    if (cash.sourceType === 'expense') {
      const expense = expensesById.get(String(cash.sourceId));
      if (!expense || cash.direction !== 'out' || !nearlyEqual(Number(expense.amount), Number(cash.amount))) add({ code: 'EXPENSE_CASH_MISMATCH', table: 'cashTransactions', recordId: String(cash.id), expected: cash.sourceId, actual: cash.amount, reason: 'Expense cash transaction has no matching expense', severity: 'critical' });
    }
  }
  for (const [paymentId, entry] of paymentById) {
    if (entry.payment.method === 'customer_credit') continue;
    if (!cashBySource.has(paymentId)) add({ code: 'MISSING_PAYMENT_CASH', table: 'invoices', recordId: String(entry.invoice.id), field: 'payments', expected: paymentId, actual: null, reason: 'Payment ledger entry has no customer_payment cash transaction', severity: 'critical' });
  }

  const purchaseCashBySource = new Map<string, { count: number; total: number }>();
  for (const cash of cashTransactions) {
    if (cash.sourceType === 'purchase' && cash.direction === 'out') {
      const current = purchaseCashBySource.get(String(cash.sourceId)) || { count: 0, total: 0 };
      current.count += 1;
      current.total += Number(cash.amount || 0);
      purchaseCashBySource.set(String(cash.sourceId), current);
    }
  }
  for (const purchase of purchases) {
    try { assertValidPaymentMethod(purchase.paymentMethod ?? 'cash'); } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      add({ code: 'INVALID_PAYMENT_METHOD', table: 'purchases', recordId: String(purchase.id), field: 'paymentMethod', expected: ['cash', 'card', 'transfer'], actual: purchase.paymentMethod, reason: message, severity: 'critical' });
    }
    const lines = Array.isArray(purchase.lines) ? purchase.lines as RestoreRow[] : [];
    if (lines.length === 0) add({ code: 'MISSING_PURCHASE_LINES', table: 'purchases', recordId: String(purchase.id), expected: 'at least one line', actual: purchase.lines, reason: 'Purchase has no line-level audit data', severity: 'critical' });
    const lineTotal = lines.reduce((sum, line) => sum + Number(line.totalAmount || 0), 0);
    if (!nearlyEqual(Number(purchase.totalAmount), lineTotal)) add({ code: 'PURCHASE_TOTAL_MISMATCH', table: 'purchases', recordId: String(purchase.id), expected: lineTotal, actual: purchase.totalAmount, reason: 'Purchase total differs from line totals', severity: 'critical' });
    for (const line of lines) {
      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0 || !nearlyEqual(Number(line.totalAmount), Number(line.quantity) * Number(line.unitPrice))) add({ code: 'INVALID_PURCHASE_LINE', table: 'purchases', recordId: String(line.id), expected: 'positive quantity, non-negative price, total=quantity*price', actual: line, reason: 'Purchase line is not auditable', severity: 'critical' });
    }
    const purchaseCash = purchaseCashBySource.get(String(purchase.id)) || { count: 0, total: 0 };
    if (purchaseCash.count === 0) add({ code: 'MISSING_PURCHASE_CASH', table: 'purchases', recordId: String(purchase.id), field: 'cashTransactions', expected: 'matching purchase cash outflow', actual: null, reason: 'Backup purchase has no matching cash ledger entry', severity: 'critical' });
    else if (!nearlyEqual(Number(purchaseCash.total), Number(purchase.totalAmount))) add({ code: 'PURCHASE_CASH_MISMATCH', table: 'purchases', recordId: String(purchase.id), field: 'cashTransactions.amount', expected: purchase.totalAmount, actual: purchaseCash.total, reason: 'Backup purchase cash ledger does not match purchase total', severity: 'critical' });
  }
  const expenseCashMatches = new Set<string>();
  for (const cash of cashTransactions) {
    if (cash.sourceType === 'expense' && cash.direction === 'out') {
      const expense = expensesById.get(String(cash.sourceId));
      if (expense && nearlyEqual(Number(cash.amount), Number(expense.amount))) expenseCashMatches.add(String(expense.id));
    }
  }
  for (const expense of expenses) {
    try { assertValidPaymentMethod(expense.paymentMethod ?? 'cash'); } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      add({ code: 'INVALID_PAYMENT_METHOD', table: 'expenses', recordId: String(expense.id), field: 'paymentMethod', expected: ['cash', 'card', 'transfer'], actual: expense.paymentMethod, reason: message, severity: 'critical' });
    }
    if (!Number.isFinite(Number(expense.amount)) || Number(expense.amount) < 0) add({ code: 'INVALID_EXPENSE_AMOUNT', table: 'expenses', recordId: String(expense.id), expected: '>= 0', actual: expense.amount, reason: 'Expense amount is invalid', severity: 'critical' });
    if (!expenseCashMatches.has(String(expense.id))) add({ code: 'MISSING_EXPENSE_CASH', table: 'expenses', recordId: String(expense.id), expected: 'matching expense cash transaction', actual: null, reason: 'Expense has no auditable cash ledger entry', severity: 'critical' });
  }
  for (const event of orderEvents) if (!ordersById.has(String(event.orderId))) add({ code: 'ORPHAN_ORDER_EVENT', table: 'orderEvents', recordId: String(event.id), expected: event.orderId, actual: null, reason: 'Order event points to a missing order', severity: 'high' });
  for (const notification of notifications) if (notification.orderId && !ordersById.has(String(notification.orderId))) add({ code: 'ORPHAN_NOTIFICATION', table: 'notifications', recordId: String(notification.id), expected: notification.orderId, actual: null, reason: 'Notification points to a missing order', severity: 'high' });

  return { ok: issues.length === 0, checkedAt: new Date().toISOString(), issues };
}
