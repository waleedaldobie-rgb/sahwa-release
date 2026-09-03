/** @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomersView } from '../components/CustomersView';
import { AccountingView } from '../components/AccountingView';
import { InvoicesView } from '../components/InvoicesView';
import { ReportsView } from '../components/ReportsView';
import type { AppData, Customer, CustomerCreditRecord, Invoice } from '../types';

const customer = {
  id: 'CUST-UI-1',
  customerNumber: 1,
  name: 'عميل الاختبار',
  phone: '0500000000',
  createdAt: '2026-08-20',
  updatedAt: '2026-08-20',
  measurements: {},
  styleDetails: {},
  measurementHistory: []
} as Customer;

const credit = (entryType: CustomerCreditRecord['entryType'], amount: number, id: string): CustomerCreditRecord => ({
  id,
  customerId: customer.id,
  entryType,
  amount,
  createdAt: '2026-08-20T10:00:00.000Z',
  occurredAt: '2026-08-20T10:00:00.000Z',
  operationId: `${id}-OP`,
  sourceEntryId: `${id}-SOURCE`,
  method: entryType === 'created' ? 'customer_credit' : 'cash',
  reason: entryType === 'created' ? 'overpayment' : 'customer refund',
  balanceAfter: entryType === 'created' ? amount : 0
});

const showToast = vi.fn();
const onSaveCustomer = vi.fn();
const onDeleteCustomer = vi.fn();

let root: Root;
let container: HTMLDivElement;

const render = async (element: React.ReactElement) => {
  await act(async () => root.render(element));
};

const setInputValue = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const reportsData = (): AppData => ({
  customers: [customer],
  orders: [{
    id: 'ORD-REPORT-UI', orderNumber: 'R-UI-1', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
    thobeTypeName: 'ثوب اختباري', fabricName: 'قماش اختباري', fabricColor: 'أبيض', garmentCount: 1,
    orderDate: '2026-08-20', deliveryDate: '2026-08-20', status: 'delivered', totalAmount: 100, paidAmount: 100,
    remainingAmount: 0, cashReceived: 100, overpaymentAmount: 0, cancellationWriteoffAmount: 0, isCustomMeasurement: false,
    measurements: {}, styleDetails: {}, createdAt: '2026-08-20T10:00:00.000Z'
  } as any],
  invoices: [{
    id: 'INV-REPORT-UI', visibleInvoiceNumber: 1, customerNumber: customer.customerNumber, invoiceNumber: 'R-INV-1', orderId: 'ORD-REPORT-UI', customerName: customer.name, customerPhone: customer.phone,
    orderDate: '2026-08-20', totalAmount: 100, paidAmount: 100, remainingAmount: 0, cashReceived: 100, overpaymentAmount: 0,
    cancellationWriteoffAmount: 0, paymentStatus: 'paid', payments: [{ id: 'PAY-REPORT-UI', invoiceId: 'INV-REPORT-UI', orderId: 'ORD-REPORT-UI', amount: 100, paymentDate: '2026-08-20', method: 'cash', cashReceived: 100, overpaymentAmount: 0 }]
  } as any],
  fabrics: [], accessories: [], thobeTypes: [], colors: [], notifications: [], stockMovements: [], purchases: [], expenses: [], cashTransactions: [{
    id: 'CASH-REPORT-UI', direction: 'in', sourceType: 'customer_payment', sourceId: 'PAY-REPORT-UI', orderId: 'ORD-REPORT-UI', amount: 100, paymentMethod: 'cash', transactionDate: '2026-08-20', description: 'تحصيل اختباري'
  } as any], orderMaterialUsages: [], orderEvents: [], customerCredits: [
    { id: 'CC-REPORT-CREATED', customerId: customer.id, entryType: 'created', amount: 20, createdAt: '2026-08-20T10:00:00.000Z', occurredAt: '2026-08-20T10:00:00.000Z', method: 'customer_credit', balanceAfter: 20 },
    { id: 'CC-REPORT-CASH', customerId: customer.id, entryType: 'refunded', amount: 5, createdAt: '2026-08-20T11:00:00.000Z', occurredAt: '2026-08-20T11:00:00.000Z', method: 'cash', balanceAfter: 15 },
    { id: 'CC-REPORT-NONCASH', customerId: customer.id, entryType: 'refunded', amount: 2, createdAt: '2026-08-20T12:00:00.000Z', occurredAt: '2026-08-20T12:00:00.000Z', method: 'card', balanceAfter: 13 }
  ]
});

const customersView = (customerCredits: CustomerCreditRecord[], onCustomerCreditChanged = vi.fn()) => (
  <CustomersView
    customers={[customer]}
    customerCredits={customerCredits}
    onCustomerCreditChanged={onCustomerCreditChanged}
    onSaveCustomer={onSaveCustomer}
    onDeleteCustomer={onDeleteCustomer}
    showToast={showToast}
  />
);

describe('Customer Credit UI', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { customerCredits: { refund: vi.fn() } }
    });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('hides refund button when available balance is zero', async () => {
    await render(customersView([credit('created', 10, 'CREDIT-1'), credit('refunded', 10, 'CREDIT-2')]));
    expect(container.querySelector(`[data-testid="customer-credit-refund-${customer.id}"]`)).toBeNull();
    expect(container.querySelector(`[data-testid="customer-credit-balance-${customer.id}"]`)?.textContent).toContain('٠');
  });

  it('shows cash warning and blocks an amount above balance in the UI', async () => {
    await render(customersView([credit('created', 100, 'CREDIT-3')]));
    const refundButton = container.querySelector<HTMLButtonElement>(`[data-testid="customer-credit-refund-${customer.id}"]`);
    expect(refundButton).not.toBeNull();
    await act(async () => refundButton?.click());
    expect(container.querySelector('[data-testid="customer-credit-cash-warning"]')).not.toBeNull();

    const amountInput = container.querySelector<HTMLInputElement>('input[type="number"]');
    expect(amountInput).not.toBeNull();
    await setInputValue(amountInput!, '101');
    expect(container.querySelector('[data-testid="customer-credit-refund-amount-error"]')?.textContent).toContain('لا يتجاوز الرصيد');
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('مراجعة الاسترداد'))?.disabled).toBe(true);
  });

  it('updates after success and prevents double click while the same idempotency request is pending', async () => {
    let resolveRefund: (value: unknown) => void = () => undefined;
    const refund = vi.fn(() => new Promise((resolve) => { resolveRefund = resolve; }));
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { customerCredits: { refund } } });
    const onCustomerCreditChanged = vi.fn().mockResolvedValue(undefined);
    await render(customersView([credit('created', 100, 'CREDIT-4')], onCustomerCreditChanged));
    await act(async () => container.querySelector<HTMLButtonElement>(`[data-testid="customer-credit-refund-${customer.id}"]`)?.click());
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
    await setInputValue(inputs.find((input) => input.type === 'number')!, '25');
    await setInputValue(inputs[inputs.length - 1], 'سبب اختباري');
    await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('مراجعة الاسترداد'))?.click());
    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('تأكيد التنفيذ')) as HTMLButtonElement;
    await act(async () => { confirmButton.click(); confirmButton.click(); });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(confirmButton.disabled).toBe(true);
    const result = { operationId: 'REFUND-1', idempotent: false, customerId: customer.id, amount: 25, entryType: 'refunded', method: 'cash', balanceAfter: 75 };
    await act(async () => resolveRefund(result));
    expect(onCustomerCreditChanged).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="customer-credit-refund-result"]')).not.toBeNull();
  });

  it('retries with the same idempotency key and displays an already processed result', async () => {
    const refund = vi.fn()
      .mockRejectedValueOnce(new Error('تعذر الاتصال المؤقت'))
      .mockResolvedValueOnce({ operationId: 'REFUND-2', idempotent: true, customerId: customer.id, amount: 20, entryType: 'refunded', method: 'card', balanceAfter: 80 });
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { customerCredits: { refund } } });
    await render(customersView([credit('created', 100, 'CREDIT-5')]));
    await act(async () => container.querySelector<HTMLButtonElement>(`[data-testid="customer-credit-refund-${customer.id}"]`)?.click());
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
    await setInputValue(inputs.find((input) => input.type === 'number')!, '20');
    await setInputValue(inputs[inputs.length - 1], 'سبب إعادة المحاولة');
    await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('مراجعة الاسترداد'))?.click());
    await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('تأكيد التنفيذ'))?.click());
    expect(container.querySelector('[data-testid="customer-credit-refund-error"]')).not.toBeNull();
    await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('إعادة المحاولة بنفس رقم العملية'))?.click());
    expect(refund).toHaveBeenCalledTimes(2);
    expect(refund.mock.calls[0][0].idempotencyKey).toBe(refund.mock.calls[1][0].idempotencyKey);
    expect(container.querySelector('[data-testid="customer-credit-refund-result"]')?.textContent).toContain('نتيجة العملية السابقة');
  });

  it('searches customers by visible customer number and renders it', async () => {
    await render(customersView([]));
    const search = container.querySelector<HTMLInputElement>('input[aria-label*="رقم العميل"]');
    expect(search).not.toBeNull();
    await setInputValue(search!, '1');
    expect(container.querySelector(`[data-testid="customer-number-${customer.id}"]`)?.textContent).toContain('#1');
    expect(container.textContent).toContain('عميل الاختبار');
  });

  it('renders the visible invoice number independently from legacy invoiceNumber', async () => {
    const invoice: Invoice = {
      id: 'INV-VISIBLE-UI', visibleInvoiceNumber: 1, customerNumber: 1, invoiceNumber: 'INV-1001', orderId: 'ORD-VISIBLE-UI',
      customerName: customer.name, customerPhone: customer.phone, orderDate: '2026-08-20', totalAmount: 100, paidAmount: 0,
      remainingAmount: 100, paymentStatus: 'unpaid', payments: []
    };
    await render(<InvoicesView invoices={[invoice]} orders={[]} invoicePrintMode="detailed" onUpdateInvoiceMode={vi.fn()} onAddPayment={vi.fn()} showToast={showToast} />);
    expect(container.textContent).toContain('INV-1');
    expect(container.textContent).not.toContain('#INV-1001');
  });

  it('renders populated Customer Credit reporting as a separate section', async () => {
    await render(<ReportsView data={reportsData()} dataRevision={{ global: 1, orders: 1, inventory: 1, accounting: 1, customers: 1 }} showToast={showToast} />);
    const section = container.querySelector('[data-testid="customer-credit-reporting-section"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('Customer Credit liability');
    expect(section?.textContent).toContain('Cash refunds');
    expect(section?.textContent).toContain('Non-cash refunds');
    expect(section?.textContent).toContain('13');
  });

  it('keeps report period controls keyboard-focusable', async () => {
    await render(<ReportsView data={reportsData()} dataRevision={{ global: 2, orders: 1, inventory: 1, accounting: 1, customers: 1 }} showToast={showToast} />);
    const todayButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'اليوم') as HTMLButtonElement;
    expect(todayButton).not.toBeUndefined();
    expect(todayButton.tabIndex).toBeGreaterThanOrEqual(0);
    todayButton.focus();
    expect(document.activeElement).toBe(todayButton);
    await act(async () => todayButton.click());
    expect(todayButton.getAttribute('aria-pressed')).toBe('true');
    expect(todayButton.className).toContain('sahwa-segmented-control__button');
  });

  it('keeps refunds separate from cash and invoice applied payment UI', async () => {
    const invoice = {
      id: 'INV-UI-1', invoiceNumber: '1001', orderId: 'ORD-UI-1', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
      orderDate: '2026-08-20', totalAmount: 100, paidAmount: 40, remainingAmount: 60, paymentStatus: 'partial', payments: [{ id: 'PAY-CC', invoiceId: 'INV-UI-1', orderId: 'ORD-UI-1', amount: 40, paymentDate: '2026-08-20', method: 'customer_credit', note: 'credit' }]
    } as Invoice;
    await render(<AccountingView fabrics={[]} accessories={[]} purchases={[]} expenses={[]} cashTransactions={[{ id: 'CASH-1', direction: 'in', sourceType: 'customer_payment', amount: 100, transactionDate: '2026-08-20', paymentMethod: 'cash', description: 'تحصيل' } as any]} invoices={[invoice]} customerCredits={[credit('created', 50, 'CREDIT-6'), { ...credit('refunded', 10, 'CREDIT-7'), method: 'card' }]} onCreatePurchase={vi.fn()} onCreateExpense={vi.fn()} onCreateCashAdjustment={vi.fn()} showToast={showToast} />);
    await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('الصندوق'))?.click());
    expect(container.querySelector('[data-testid="customer-credit-refunds-section"]')?.textContent).toContain('Customer Credit Refunds');
    expect(container.querySelector('[data-testid="customer-credit-refunds-section"]')?.textContent).toContain('لا يغير الصندوق');

    await render(<InvoicesView invoices={[invoice]} orders={[]} invoicePrintMode="detailed" onUpdateInvoiceMode={vi.fn()} onAddPayment={vi.fn()} showToast={showToast} />);
    expect(container.querySelector('[data-testid="invoice-credit-applied-INV-UI-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="invoice-credit-applied-INV-UI-1"]')?.textContent).toContain('غير نقدي');

    await render(<InvoicesView invoices={[{ ...invoice, paymentStatus: 'settled_by_cancellation', remainingAmount: 0, cancellationWriteoffAmount: 60 }]} orders={[]} invoicePrintMode="detailed" onUpdateInvoiceMode={vi.fn()} onAddPayment={vi.fn()} showToast={showToast} />);
    expect(container.textContent).toContain('مُسوّى بالإلغاء');
  });
});
