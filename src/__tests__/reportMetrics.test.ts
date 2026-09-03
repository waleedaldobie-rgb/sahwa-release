import { describe, expect, it } from 'vitest';
import { calculateReportProjection } from '../domain/reportMetrics';
import { Invoice, Order, OrderMaterialUsage } from '../types';

const order = (overrides: Partial<Order> = {}) => ({
  id: 'ORD-REPORT-1',
  orderNumber: '1001',
  customerId: 'CUS-REPORT-1',
  customerName: 'عميل التقرير',
  customerPhone: '0500000000',
  thobeTypeId: 'THB-1',
  thobeTypeName: 'ثوب',
  fabricId: 'FAB-1',
  fabricName: 'قماش',
  fabricColor: 'أبيض',
  orderDate: '2026-08-10',
  deliveryDate: '2026-08-20',
  status: 'new',
  totalAmount: 100,
  paidAmount: 0,
  remainingAmount: 100,
  isCustomMeasurement: false,
  measurements: {} as Order['measurements'],
  styleDetails: {} as Order['styleDetails'],
  createdAt: '2026-08-10T00:00:00.000Z',
  ...overrides
} satisfies Order);

const invoice = (overrides: Partial<Invoice> = {}) => ({
  id: 'INV-REPORT-1',
  invoiceNumber: 'INV-1001',
  orderId: 'ORD-REPORT-1',
  customerName: 'عميل التقرير',
  customerPhone: '0500000000',
  orderDate: '2026-08-10',
  totalAmount: 100,
  paidAmount: 0,
  remainingAmount: 100,
  paymentStatus: 'unpaid',
  payments: [],
  ...overrides
} satisfies Invoice);

describe('shared report projection', () => {
  it('reports cancellation writeoff as non-cash and excludes it from profit', () => {
    const result = calculateReportProjection({
      orders: [order({ totalAmount: 300, paidAmount: 100, remainingAmount: 0, status: 'cancelled', cancellationWriteoffAmount: 200 })],
      invoices: [invoice({ totalAmount: 300, paidAmount: 100, remainingAmount: 0, paymentStatus: 'settled_by_cancellation', cancellationWriteoffAmount: 200, payments: [{ id: 'PAY-1', invoiceId: 'INV-REPORT-1', orderId: 'ORD-REPORT-1', amount: 100, cashReceived: 100, paymentDate: '2026-08-10', method: 'cash' }] })],
      orderEvents: [{ id: 'EV-1', orderId: 'ORD-REPORT-1', type: 'status_changed', title: 'إلغاء', description: 'إلغاء', toStatus: 'cancelled', createdAt: '2026-08-11' }],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    expect(result.cancellationWriteoff).toBe(200);
    expect(result.salesBooked).toBe(0);
    expect(result.recognizedRevenue).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(result.details[0].includedInSales).toBe(false);
    expect(result.details[0].settlementStatus).toBe('settled_by_cancellation');
  });

  it('separates applied collection from overpayment cash and liability', () => {
    const result = calculateReportProjection({
      orders: [order({ paidAmount: 100, remainingAmount: 0, cashReceived: 120, overpaymentAmount: 20 })],
      invoices: [invoice({ paidAmount: 100, remainingAmount: 0, paymentStatus: 'paid', cashReceived: 120, overpaymentAmount: 20, payments: [{ id: 'PAY-2', invoiceId: 'INV-REPORT-1', orderId: 'ORD-REPORT-1', amount: 100, cashReceived: 120, overpaymentAmount: 20, paymentDate: '2026-08-10', method: 'cash' }] })],
      cashTransactions: [{ id: 'CASH-2', direction: 'in', sourceType: 'customer_payment', sourceId: 'PAY-2', orderId: 'ORD-REPORT-1', amount: 120, paymentMethod: 'cash', transactionDate: '2026-08-10', description: 'دفعة', createdAt: '2026-08-10' }],
      customerCredits: [{ id: 'CREDIT-2', customerId: 'CUS-REPORT-1', invoiceId: 'INV-REPORT-1', paymentId: 'PAY-2', entryType: 'created', amount: 20, createdAt: '2026-08-10' }],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    expect(result.appliedCollected).toBe(100);
    expect(result.cashReceived).toBe(120);
    expect(result.overpaymentCreated).toBe(20);
    expect(result.closingCustomerCreditLiability).toBe(20);
    expect(result.netProfit).toBe(0);
  });

  it('reduces customer-credit liability only through applied/refunded ledger entries', () => {
    const result = calculateReportProjection({
      orders: [order({ paidAmount: 100, remainingAmount: 0, cashReceived: 120, overpaymentAmount: 20 })],
      invoices: [invoice({ paidAmount: 100, remainingAmount: 0, paymentStatus: 'paid', cashReceived: 120, overpaymentAmount: 20, payments: [{ id: 'PAY-3', invoiceId: 'INV-REPORT-1', orderId: 'ORD-REPORT-1', amount: 100, cashReceived: 120, paymentDate: '2026-08-10', method: 'cash' }] })],
      customerCredits: [
        { id: 'C-1', customerId: 'CUS-REPORT-1', entryType: 'created', amount: 20, createdAt: '2026-08-10' },
        { id: 'C-2', customerId: 'CUS-REPORT-1', entryType: 'applied', amount: 5, createdAt: '2026-08-15' },
        { id: 'C-3', customerId: 'CUS-REPORT-1', entryType: 'refunded', amount: 3, createdAt: '2026-08-16' }
      ],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    expect(result.overpaymentCreated).toBe(20);
    expect(result.overpaymentApplied).toBe(5);
    expect(result.overpaymentRefunded).toBe(3);
    expect(result.closingCustomerCreditLiability).toBe(12);
    expect(result.salesBooked).toBe(100);
  });

  it('keeps customer credit refunds separate from profit, cash, and recognized revenue', () => {
    const result = calculateReportProjection({
      orders: [],
      invoices: [],
      customerCredits: [
        { id: 'CC-CREATED', customerId: 'CUS-REPORT-1', entryType: 'created', amount: 20, createdAt: '2026-08-01', occurredAt: '2026-08-10' },
        { id: 'CC-CASH-REFUND', customerId: 'CUS-REPORT-1', entryType: 'refunded', amount: 5, method: 'cash', createdAt: '2026-08-01', occurredAt: '2026-08-11' },
        { id: 'CC-CARD-REFUND', customerId: 'CUS-REPORT-1', entryType: 'refunded', amount: 2, method: 'card', createdAt: '2026-08-01', occurredAt: '2026-08-12' }
      ],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    expect(result.overpaymentCreated).toBe(20);
    expect(result.overpaymentRefunded).toBe(7);
    expect(result.customerCreditCashRefunds).toBe(5);
    expect(result.customerCreditNonCashRefunds).toBe(2);
    expect(result.closingCustomerCreditLiability).toBe(13);
    expect(result.cashReceived).toBe(0);
    expect(result.recognizedRevenue).toBe(0);
    expect(result.netProfit).toBe(0);
  });

  it('uses occurred_at as the strict customer-credit closing date basis', () => {
    const result = calculateReportProjection({
      orders: [],
      invoices: [],
      customerCredits: [
        { id: 'CC-DATE', customerId: 'CUS-REPORT-1', entryType: 'created', amount: 20, createdAt: '2026-07-31', occurredAt: '2026-09-01' }
      ],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    expect(result.overpaymentCreated).toBe(0);
    expect(result.closingCustomerCreditLiability).toBe(0);
  });

  it('uses delivery date for recognized revenue and keeps booked sales separate', () => {
    const result = calculateReportProjection({
      orders: [order({ orderDate: '2026-07-31', deliveryDate: '2026-08-05', status: 'delivered', totalAmount: 200, materialCost: 80, remainingAmount: 0, paidAmount: 200 })],
      invoices: [invoice({ orderDate: '2026-07-31', totalAmount: 200, paidAmount: 200, remainingAmount: 0, paymentStatus: 'paid' })],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    expect(result.salesBooked).toBe(0);
    expect(result.recognizedRevenue).toBe(200);
    expect(result.recognizedMaterialCost).toBe(80);
    expect(result.grossProfit).toBe(120);
  });

  it('reconciles sales summary to detail rows marked included_in_sales', () => {
    const result = calculateReportProjection({
      orders: [order({ id: 'ACTIVE', totalAmount: 100 }), order({ id: 'CANCELLED', status: 'cancelled', totalAmount: 75, remainingAmount: 0, cancellationWriteoffAmount: 75 })],
      invoices: [invoice({ orderId: 'ACTIVE' }), invoice({ id: 'INV-CANCELLED', orderId: 'CANCELLED', totalAmount: 75, remainingAmount: 0, paymentStatus: 'settled_by_cancellation', cancellationWriteoffAmount: 75 })],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    const detailSales = result.details.filter((row) => row.includedInSales).reduce((sum, row) => sum + row.order.totalAmount, 0);
    expect(result.salesBooked).toBe(detailSales);
    expect(result.details.find((row) => row.order.id === 'CANCELLED')?.settlementStatus).toBe('settled_by_cancellation');
  });

  // BUG-012 regression: avgOrderValue (ReportsView) is salesBooked / salesOrdersCount.
  // salesOrdersCount must count only non-cancelled orders included in sales — the
  // same population salesBooked is summed over — so a cancelled order (already
  // excluded from the numerator) can never dilute the denominator either.
  it('keeps salesOrdersCount aligned with the non-cancelled orders behind salesBooked', () => {
    const result = calculateReportProjection({
      orders: [
        order({ id: 'ORD-A', status: 'new', totalAmount: 100, orderDate: '2026-08-10' }),
        order({ id: 'ORD-B', status: 'delivered', totalAmount: 300, orderDate: '2026-08-12', deliveryDate: '2026-08-13' }),
        order({ id: 'ORD-C', status: 'cancelled', totalAmount: 500, orderDate: '2026-08-15', remainingAmount: 0, cancellationWriteoffAmount: 500 })
      ],
      invoices: [],
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    // 3 orders fall in the period, but only 2 are non-cancelled.
    expect(result.totalOrdersCount).toBe(3);
    expect(result.salesOrdersCount).toBe(2);
    expect(result.salesBooked).toBe(400);

    // Mirrors ReportsView's avgOrderValue formula exactly.
    const avgOrderValue = result.salesOrdersCount > 0 ? Math.round(result.salesBooked / result.salesOrdersCount) : 0;
    expect(avgOrderValue).toBe(200);
    // Regression guard: using totalOrdersCount (the pre-fix denominator) instead
    // of salesOrdersCount would silently dilute this to 133.
    expect(avgOrderValue).not.toBe(Math.round(result.salesBooked / result.totalOrdersCount));
  });

  // BUG-013 regression: material cost must come from the same place whether
  // the projection is built for the on-screen report or for the Excel export
  // (generateExcelReport passes orderMaterialUsages the same way ReportsView
  // does), so the two can never show different numbers again.
  describe('material cost source of truth (BUG-013)', () => {
    const usage = (overrides: Partial<OrderMaterialUsage> = {}): OrderMaterialUsage => ({
      id: 'USAGE-1',
      orderId: 'ORD-REPORT-1',
      itemType: 'fabric',
      itemName: 'قماش',
      quantity: 3,
      unit: 'meter',
      unitCostAtUsage: 45.7,
      totalCost: 137.1,
      createdAt: '2026-08-11',
      ...overrides
    });

    it('prefers actual recorded material usage over the consumption/price estimate', () => {
      const result = calculateReportProjection({
        orders: [order({ status: 'delivered', deliveryDate: '2026-08-12', totalAmount: 500, fabricConsumptionMeters: 0, garmentCount: 2, fabricBuyPriceAtOrder: 50 })],
        invoices: [invoice()],
        orderMaterialUsages: [usage()],
        startDate: '2026-08-01',
        endDate: '2026-08-31'
      });
      // Estimate fallback would have given 50 * max(1, 2) = 100; the recorded
      // usage total (137.1) must win instead.
      expect(result.details[0].materialCost).toBe(137.1);
      expect(result.recognizedMaterialCost).toBe(137.1);
    });

    it('sums multiple usage rows (fabric + accessories) for the same order', () => {
      const result = calculateReportProjection({
        orders: [order({ status: 'delivered', deliveryDate: '2026-08-12' })],
        invoices: [invoice()],
        orderMaterialUsages: [
          usage({ id: 'U-FABRIC', itemType: 'fabric', totalCost: 100 }),
          usage({ id: 'U-BUTTON', itemType: 'accessory', itemName: 'أزرار', totalCost: 12.5 })
        ],
        startDate: '2026-08-01',
        endDate: '2026-08-31'
      });
      expect(result.details[0].materialCost).toBe(112.5);
    });

    it('treats a recorded zero-cost usage as known, not as "no data" (no fallback re-triggered)', () => {
      const result = calculateReportProjection({
        orders: [order({ status: 'delivered', deliveryDate: '2026-08-12', fabricConsumptionMeters: 5, fabricBuyPriceAtOrder: 50 })],
        invoices: [invoice()],
        orderMaterialUsages: [usage({ totalCost: 0 })],
        startDate: '2026-08-01',
        endDate: '2026-08-31'
      });
      // A naive `sum || fallback` check would wrongly fall back to 5 * 50 = 250
      // here because 0 is falsy in JS; the correct behavior is to trust the
      // recorded (zero) usage cost.
      expect(result.details[0].materialCost).toBe(0);
    });

    it('falls back to the consumption/price estimate when no usage records exist for the order', () => {
      const result = calculateReportProjection({
        orders: [order({ status: 'delivered', deliveryDate: '2026-08-12', fabricConsumptionMeters: 0, garmentCount: 3, fabricBuyPriceAtOrder: 40 })],
        invoices: [invoice()],
        orderMaterialUsages: [usage({ orderId: 'SOME-OTHER-ORDER' })],
        startDate: '2026-08-01',
        endDate: '2026-08-31'
      });
      expect(result.details[0].materialCost).toBe(120);
    });
  });
});
