import {
  CashTransaction,
  CustomerCreditRecord,
  ExpenseRecord,
  Invoice,
  Order,
  OrderEvent,
  OrderMaterialUsage,
  PaymentSettlementStatus,
  PurchaseRecord,
  StockMovement
} from '../types';

export interface ReportDateRange {
  startDate?: string;
  endDate?: string;
}

export interface ReportProjectionInput extends ReportDateRange {
  orders: Order[];
  invoices: Invoice[];
  cashTransactions?: CashTransaction[];
  customerCredits?: CustomerCreditRecord[];
  purchases?: PurchaseRecord[];
  expenses?: ExpenseRecord[];
  stockMovements?: StockMovement[];
  orderEvents?: OrderEvent[];
  // Actual recorded material consumption (fabric + accessories) per order.
  // When present for an order, this is the authoritative material cost source
  // (same figure on screen and in Excel) — see materialCostFor().
  orderMaterialUsages?: OrderMaterialUsage[];
}

export interface ReportDetailRow {
  order: Order;
  paymentStatus: PaymentSettlementStatus;
  settlementStatus: 'none' | 'paid' | 'partial' | 'cancelled' | 'settled_by_cancellation';
  includedInSales: boolean;
  includedInRecognizedRevenue: boolean;
  appliedPaid: number;
  cashReceived: number;
  overpaymentAmount: number;
  cancellationWriteoffAmount: number;
  materialCost: number;
}

export interface ReportProjection {
  details: ReportDetailRow[];
  salesBooked: number;
  recognizedRevenue: number;
  recognizedMaterialCost: number;
  appliedCollected: number;
  cashReceived: number;
  overpaymentCreated: number;
  overpaymentApplied: number;
  overpaymentRefunded: number;
  customerCreditCashRefunds: number;
  customerCreditNonCashRefunds: number;
  closingCustomerCreditLiability: number;
  cancellationWriteoff: number;
  activeOutstanding: number;
  totalPurchases: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  totalOrdersCount: number;
  salesOrdersCount: number;
  cancelledOrdersCount: number;
  settledByCancellationCount: number;
  filteredCash: CashTransaction[];
  filteredMovements: StockMovement[];
  filteredPurchases: PurchaseRecord[];
  filteredExpenses: ExpenseRecord[];
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const amount = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};
const dateKey = (value?: string) => String(value || '').slice(0, 10);
const inRange = (value: string | undefined, range: ReportDateRange) => {
  const key = dateKey(value);
  if (!key) return false;
  if (range.startDate && key < dateKey(range.startDate)) return false;
  if (range.endDate && key > dateKey(range.endDate)) return false;
  return true;
};
const sum = (values: number[]) => round2(values.reduce((total, value) => total + amount(value), 0));

const invoiceByOrder = (invoices: Invoice[]) => new Map(invoices.map((invoice) => [invoice.orderId, invoice]));

// Builds orderId -> total recorded material cost from actual usage records
// (fabric + accessories, at the cost recorded when the material left stock).
// Uses .has() rather than a falsy check so a genuinely-recorded zero cost is
// still treated as "known" and is not overwritten by the estimate fallback.
const buildUsageCostByOrder = (usages: OrderMaterialUsage[]) => {
  const map = new Map<string, number>();
  for (const usage of usages) {
    if (!usage.orderId) continue;
    map.set(usage.orderId, (map.get(usage.orderId) ?? 0) + amount(usage.totalCost));
  }
  return map;
};

// Single source of truth for an order's material cost, shared by the on-screen
// report (ReportsView) and the Excel export (generateExcelReport) so the two
// can never diverge again:
//   1) actual recorded material usage for the order, if any (most accurate —
//      reflects real consumption and real cost at time of usage);
//   2) a pre-computed materialCost already attached to the order, if any;
//   3) an estimate from the order's fabric price and consumption, falling back
//      to at least 1 unit (via garment count) when consumption is 0/missing.
const materialCostFor = (order: Order, usageCostByOrder: Map<string, number>) => {
  if (usageCostByOrder.has(order.id)) return round2(usageCostByOrder.get(order.id)!);
  if (typeof order.materialCost === 'number') return amount(order.materialCost);
  const buyPrice = amount(order.fabricBuyPriceAtOrder);
  const consumption = amount(order.fabricConsumptionMeters) > 0 ? amount(order.fabricConsumptionMeters) : Math.max(1, amount(order.garmentCount));
  return round2(buyPrice * consumption);
};

const eventDateForCancellation = (order: Order, events: OrderEvent[]) => {
  const event = events
    .filter((item) => item.orderId === order.id && item.toStatus === 'cancelled')
    .sort((left, right) => dateKey(left.createdAt).localeCompare(dateKey(right.createdAt)))[0];
  return event?.createdAt || order.orderDate;
};

const settlementStatusFor = (order: Order, invoice?: Invoice): ReportDetailRow['settlementStatus'] => {
  if (order.status === 'cancelled') {
    return amount(order.cancellationWriteoffAmount ?? invoice?.cancellationWriteoffAmount) > 0
      ? 'settled_by_cancellation'
      : 'cancelled';
  }
  if (invoice?.paymentStatus === 'paid' || invoice?.paymentStatus === 'settled_by_cancellation' || amount(order.remainingAmount) === 0) return 'paid';
  return amount(order.paidAmount) > 0 ? 'partial' : 'none';
};

export const calculateReportProjection = (input: ReportProjectionInput): ReportProjection => {
  const {
    orders,
    invoices,
    cashTransactions = [],
    customerCredits = [],
    purchases = [],
    expenses = [],
    stockMovements = [],
    orderEvents = [],
    orderMaterialUsages = [],
    startDate,
    endDate
  } = input;
  const range = { startDate, endDate };
  const byOrder = invoiceByOrder(invoices);
  const usageCostByOrder = buildUsageCostByOrder(orderMaterialUsages);
  const details = orders
    .filter((order) => inRange(order.orderDate, range)
      || inRange(order.deliveryDate, range)
      || cashTransactions.some((transaction) => transaction.orderId === order.id && inRange(transaction.transactionDate, range))
      || invoices.some((invoice) => invoice.orderId === order.id && invoice.payments.some((payment) => inRange(payment.paymentDate, range)))
      || orderEvents.some((event) => event.orderId === order.id && event.toStatus === 'cancelled' && inRange(event.createdAt, range)))
    .map((order) => {
      const invoice = byOrder.get(order.id);
      const appliedPaid = amount(order.paidAmount ?? invoice?.paidAmount);
      const cashReceived = amount(order.cashReceived ?? invoice?.cashReceived ?? appliedPaid);
      const overpaymentAmount = amount(order.overpaymentAmount ?? invoice?.overpaymentAmount);
      const cancellationWriteoffAmount = amount(order.cancellationWriteoffAmount ?? invoice?.cancellationWriteoffAmount);
      return {
        order,
        paymentStatus: invoice?.paymentStatus || (order.remainingAmount === 0 ? 'paid' : appliedPaid > 0 ? 'partial' : 'unpaid'),
        settlementStatus: settlementStatusFor(order, invoice),
        includedInSales: order.status !== 'cancelled' && inRange(order.orderDate, range),
        includedInRecognizedRevenue: order.status === 'delivered',
        appliedPaid,
        cashReceived,
        overpaymentAmount,
        cancellationWriteoffAmount,
        materialCost: materialCostFor(order, usageCostByOrder)
      } satisfies ReportDetailRow;
    });

  const salesRows = details.filter((row) => row.includedInSales && inRange(row.order.orderDate, range));
  const salesBooked = sum(salesRows.map((row) => row.order.totalAmount));
  const recognizedRows = details.filter((row) => row.includedInRecognizedRevenue && inRange(row.order.deliveryDate, range));
  const recognizedRevenue = sum(recognizedRows.map((row) => row.order.totalAmount));
  const recognizedMaterialCost = sum(recognizedRows.map((row) => row.materialCost));
  const filteredCash = cashTransactions.filter((transaction) => inRange(transaction.transactionDate, range));
  const filteredMovements = stockMovements.filter((movement) => inRange(movement.createdAt, range));
  const filteredPurchases = purchases.filter((purchase) => inRange(purchase.purchaseDate, range));
  const filteredExpenses = expenses.filter((expense) => inRange(expense.expenseDate, range));
  const customerPaymentCash = filteredCash.filter((transaction) => transaction.direction === 'in' && transaction.sourceType === 'customer_payment');
  const appliedCollected = sum(invoices.flatMap((invoice) => invoice.payments.filter((payment) => inRange(payment.paymentDate, range)).map((payment) => payment.amount)));
  const cashReceived = sum(customerPaymentCash.map((transaction) => transaction.amount));
  const creditDate = (credit: CustomerCreditRecord) => credit.occurredAt || credit.createdAt;
  const creditsInPeriod = customerCredits.filter((credit) => inRange(creditDate(credit), range));
  const overpaymentCreated = sum(creditsInPeriod.filter((credit) => credit.entryType === 'created').map((credit) => credit.amount));
  const overpaymentApplied = sum(creditsInPeriod.filter((credit) => credit.entryType === 'applied').map((credit) => credit.amount));
  const overpaymentRefunded = sum(creditsInPeriod.filter((credit) => credit.entryType === 'refunded').map((credit) => credit.amount));
  const customerCreditCashRefunds = sum(creditsInPeriod.filter((credit) => credit.entryType === 'refunded' && credit.method === 'cash').map((credit) => credit.amount));
  const customerCreditNonCashRefunds = sum(creditsInPeriod.filter((credit) => credit.entryType === 'refunded' && credit.method !== 'cash').map((credit) => credit.amount));
  const creditsToEnd = customerCredits.filter((credit) => !endDate || dateKey(creditDate(credit)) <= dateKey(endDate));
  const closingCustomerCreditLiability = round2(
    sum(creditsToEnd.filter((credit) => credit.entryType === 'created').map((credit) => credit.amount))
      - sum(creditsToEnd.filter((credit) => credit.entryType === 'applied').map((credit) => credit.amount))
      - sum(creditsToEnd.filter((credit) => credit.entryType === 'refunded').map((credit) => credit.amount))
  );
  const cancellationRows = details.filter((row) => row.order.status === 'cancelled' && inRange(eventDateForCancellation(row.order, orderEvents), range));
  const cancellationWriteoff = sum(cancellationRows.map((row) => row.cancellationWriteoffAmount));
  const activeOutstanding = sum(details.filter((row) => row.order.status !== 'cancelled').map((row) => row.order.remainingAmount));
  const totalPurchases = sum(filteredPurchases.map((purchase) => purchase.totalAmount));
  const totalExpenses = sum(filteredExpenses.map((expense) => expense.amount));
  const grossProfit = round2(recognizedRevenue - recognizedMaterialCost);
  const netProfit = round2(grossProfit - totalExpenses);

  return {
    details,
    salesBooked,
    recognizedRevenue,
    recognizedMaterialCost,
    appliedCollected,
    cashReceived,
    overpaymentCreated,
    overpaymentApplied,
    overpaymentRefunded,
    customerCreditCashRefunds,
    customerCreditNonCashRefunds,
    closingCustomerCreditLiability,
    cancellationWriteoff,
    activeOutstanding,
    totalPurchases,
    totalExpenses,
    grossProfit,
    netProfit,
    totalOrdersCount: details.length,
    salesOrdersCount: salesRows.length,
    cancelledOrdersCount: details.filter((row) => row.order.status === 'cancelled').length,
    settledByCancellationCount: details.filter((row) => row.settlementStatus === 'settled_by_cancellation').length,
    filteredCash,
    filteredMovements,
    filteredPurchases,
    filteredExpenses
  };
};

export const formatReportStatus = (status: ReportDetailRow['settlementStatus']) => {
  switch (status) {
    case 'cancelled': return 'ملغى';
    case 'settled_by_cancellation': return 'ملغى مع تسوية';
    case 'paid': return 'مدفوع';
    case 'partial': return 'متبقي';
    default: return 'غير مدفوع';
  }
};
