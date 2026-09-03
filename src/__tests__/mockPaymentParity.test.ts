import { describe, expect, it } from 'vitest';
import { AppData } from '../types';
import { calculatePaymentUpdate, assertStoredPaymentAggregates } from '../domain/paymentRules';
import { calculateCancellationSettlement } from '../domain/orderRules';
import { calculateReportProjection } from '../domain/reportMetrics';
import { applyPaymentToDraft } from '../services/adapters/paymentDraftAdapter';
import { settleCancelledOrderInDraft } from '../services/adapters/orderSettlementAdapter';
import { assertMockBusinessIntegrity } from '../services/adapters/mockIntegrityAdapter';

function fixture(): AppData {
  return {
    customers: [{ id: 'C1', name: 'Parity Customer', phone: '0500000000', measurements: {}, styleDetails: {}, measurementHistory: [] } as any],
    orders: [{
      id: 'ORD-PARITY', orderNumber: 'PARITY-1', customerId: 'C1', customerName: 'Parity Customer', customerPhone: '0500000000',
      thobeTypeId: 'T1', thobeTypeName: 'ثوب', fabricId: '', fabricName: '', fabricColor: '', fabricConsumptionMeters: 0,
      fabricBuyPriceAtOrder: 0, garmentCount: 1, initialPaymentMethod: 'cash', orderDate: '2026-08-01', deliveryDate: '2026-08-02', status: 'new',
      totalAmount: 100, paidAmount: 0, remainingAmount: 100, cashReceived: 0, overpaymentAmount: 0, cancellationWriteoffAmount: 0,
      isCustomMeasurement: false, measurements: {}, styleDetails: {}, createdAt: '2026-08-01'
    } as any],
    invoices: [{
      id: 'INV-PARITY', invoiceNumber: 'INV-PARITY', orderId: 'ORD-PARITY', customerName: 'Parity Customer', customerPhone: '0500000000', orderDate: '2026-08-01',
      totalAmount: 100, paidAmount: 0, remainingAmount: 100, cashReceived: 0, overpaymentAmount: 0, cancellationWriteoffAmount: 0, paymentStatus: 'unpaid', payments: []
    } as any],
    fabrics: [], accessories: [], thobeTypes: [], colors: [], notifications: [], stockMovements: [], purchases: [], expenses: [], cashTransactions: [], orderMaterialUsages: [], orderEvents: [], customerCredits: []
  };
}

describe('Mock/Production payment parity', () => {
  it('matches Production settlement output for a 120 cash payment on a 100 invoice', () => {
    const data = fixture();
    const production = calculatePaymentUpdate(100, 0, 100, 120);
    expect(applyPaymentToDraft(data, 'INV-PARITY', 120, 'cash', 'parity', 'PAY-PARITY')).toBe(true);
    const invoice = data.invoices[0];

    expect({ paidAmount: invoice.paidAmount, remainingAmount: invoice.remainingAmount, cashReceived: invoice.cashReceived, overpaymentAmount: invoice.overpaymentAmount, paymentStatus: invoice.paymentStatus })
      .toEqual({ paidAmount: production.paidAmount, remainingAmount: production.remainingAmount, cashReceived: production.cashReceived, overpaymentAmount: production.overpaymentAmount, paymentStatus: production.paymentStatus });
    expect(data.cashTransactions[0].amount).toBe(production.cashReceived);
    expect(data.customerCredits).toHaveLength(1);
    expect(data.customerCredits[0].amount).toBe(production.overpaymentAmount);
    assertMockBusinessIntegrity(data);
  });

  it('matches Production cancellation writeoff and settlement status', () => {
    const data = fixture();
    const productionPayment = calculatePaymentUpdate(100, 0, 100, 30);
    expect(applyPaymentToDraft(data, 'INV-PARITY', 30, 'cash', 'parity', 'PAY-PARITY')).toBe(true);
    const productionSettlement = calculateCancellationSettlement({
      invoiceTotal: 100, appliedPaid: productionPayment.paidAmount, cashReceived: productionPayment.cashReceived,
      cancellationWriteoffAmount: 70, customerId: 'C1'
    });
    data.orders[0].status = 'cancelled';
    const mockSettlement = settleCancelledOrderInDraft(data, 'ORD-PARITY');

    expect(mockSettlement).toEqual({ ...productionSettlement, cashReceived: productionPayment.cashReceived, overpaymentAmount: 0 });
    expect(data.invoices[0].paymentStatus).toBe(productionSettlement.paymentStatus);
    expect(data.invoices[0].remainingAmount).toBe(productionSettlement.remainingAmount);
    assertMockBusinessIntegrity(data);
  });

  it('keeps cancellation settlement idempotent', () => {
    const data = fixture();
    expect(applyPaymentToDraft(data, 'INV-PARITY', 30, 'cash', 'parity', 'PAY-PARITY')).toBe(true);
    data.orders[0].status = 'cancelled';
    const first = settleCancelledOrderInDraft(data, 'ORD-PARITY');
    const second = settleCancelledOrderInDraft(data, 'ORD-PARITY');
    expect(second).toEqual(first);
    expect(data.invoices[0].cancellationWriteoffAmount).toBe(70);
    expect(data.invoices[0].remainingAmount).toBe(0);
  });

  it('rejects Mock payment on a cancelled order without mutating the ledger', () => {
    const data = fixture();
    data.orders[0].status = 'cancelled';
    expect(() => applyPaymentToDraft(data, 'INV-PARITY', 10, 'cash', 'invalid', 'PAY-CANCELLED')).toThrow('لا يمكن تسجيل دفعة لطلب ملغى');
    expect(data.invoices[0].payments).toHaveLength(0);
    expect(data.cashTransactions).toHaveLength(0);
  });

  it('keeps report projection equal when fed the same Production-shaped settlement data', () => {
    const data = fixture();
    expect(applyPaymentToDraft(data, 'INV-PARITY', 120, 'cash', 'parity', 'PAY-PARITY')).toBe(true);
    const productionProjection = calculateReportProjection({ ...data, customerCredits: data.customerCredits });
    const mockProjection = calculateReportProjection({ ...data, customerCredits: data.customerCredits });
    expect(mockProjection).toEqual(productionProjection);
    expect(mockProjection.appliedCollected).toBe(100);
    expect(mockProjection.cashReceived).toBe(120);
    expect(mockProjection.closingCustomerCreditLiability).toBe(20);
  });
});
