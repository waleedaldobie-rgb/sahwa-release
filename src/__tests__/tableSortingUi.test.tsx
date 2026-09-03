// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { CustomersView } from '../components/CustomersView';
import { InvoicesView } from '../components/InvoicesView';
import { OrdersView } from '../components/OrdersView';
import { InventoryView } from '../components/InventoryView';
import type { Customer, Invoice, FabricItem } from '../types';
import { EMPTY_MEASUREMENTS, EMPTY_STYLE_DETAILS } from '../services/shared/measurementDefaults';

const showToast = vi.fn();
let root: Root;
let container: HTMLDivElement;

const customer = (id: string, customerNumber: number, name: string, createdAt: string): Customer => ({
  id,
  customerNumber,
  name,
  phone: `05000000${customerNumber}`,
  createdAt,
  updatedAt: createdAt,
  measurements: { ...EMPTY_MEASUREMENTS },
  styleDetails: { ...EMPTY_STYLE_DETAILS },
  measurementHistory: []
});

const invoice = (id: string, visibleInvoiceNumber: number, totalAmount: number, remainingAmount: number): Invoice => ({
  id,
  visibleInvoiceNumber,
  customerNumber: visibleInvoiceNumber,
  invoiceNumber: `INV-${1000 + visibleInvoiceNumber}`,
  orderId: `ORD-${id}`,
  customerName: `عميل ${visibleInvoiceNumber}`,
  customerPhone: `05000000${visibleInvoiceNumber}`,
  orderDate: `2026-08-${String(visibleInvoiceNumber).padStart(2, '0')}`,
  totalAmount,
  paidAmount: totalAmount - remainingAmount,
  remainingAmount,
  paymentStatus: remainingAmount === 0 ? 'paid' : 'partial',
  payments: []
});

const render = async (element: React.ReactElement) => {
  await act(async () => root.render(element));
};

const rowTexts = () => Array.from(container.querySelectorAll('tbody tr')).map((row) => row.textContent || '');

describe('Table sorting UI', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('sorts customers by visible number and exposes the active direction', async () => {
    await render(
      <CustomersView
        customers={[customer('C-2', 2, 'زيد', '2026-08-02'), customer('C-1', 1, 'أحمد', '2026-08-01')]}
        customerCredits={[]}
        onSaveCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        showToast={showToast}
      />
    );

    const sortButton = container.querySelector<HTMLButtonElement>('button[aria-label="فرز حسب رقم العميل"]');
    expect(sortButton).not.toBeNull();
    expect(sortButton?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(rowTexts()[0]).toContain('#1');

    await act(async () => sortButton?.click());
    expect(sortButton?.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(rowTexts()[0]).toContain('#2');

    await act(async () => sortButton?.click());
    expect(sortButton?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(rowTexts()[0]).toContain('#1');
  });

  it('sorts invoices numerically by visible invoice number instead of lexical INV text', async () => {
    await render(
      <InvoicesView
        invoices={[invoice('INV-10', 10, 200, 50), invoice('INV-2', 2, 100, 20)]}
        orders={[]}
        invoicePrintMode="detailed"
        onUpdateInvoiceMode={vi.fn()}
        onAddPayment={vi.fn()}
        showToast={showToast}
      />
    );

    const sortButton = container.querySelector<HTMLButtonElement>('button[aria-label="فرز حسب رقم الفاتورة"]');
    expect(sortButton).not.toBeNull();
    expect(rowTexts()[0]).toContain('INV-2');

    await act(async () => sortButton?.click());
    expect(sortButton?.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(rowTexts()[0]).toContain('INV-10');
  });

  it('sorts orders numerically by order number and toggles direction', async () => {
    await render(
      <OrdersView
        orders={[{ id: 'ORD-10', orderNumber: 'ORD-10', customerName: 'زيد', customerPhone: '0500000010', deliveryDate: '2026-08-20', totalAmount: 200, paidAmount: 0, remainingAmount: 200, status: 'new' } as any, { id: 'ORD-2', orderNumber: 'ORD-2', customerName: 'أحمد', customerPhone: '0500000002', deliveryDate: '2026-08-21', totalAmount: 100, paidAmount: 0, remainingAmount: 100, status: 'ready' } as any]}
        customers={[]}
        fabrics={[]}
        accessories={[]}
        thobeTypes={[]}
        onSaveOrder={vi.fn()}
        onUpdateOrderStatus={vi.fn()}
        onSendWhatsAppNotice={vi.fn()}
        showToast={showToast}
      />
    );

    const sortButton = container.querySelector<HTMLButtonElement>('button[aria-label="فرز حسب رقم الطلب"]');
    expect(sortButton).not.toBeNull();
    expect(rowTexts()[0]).toContain('#ORD-2');

    await act(async () => sortButton?.click());
    expect(sortButton?.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(rowTexts()[0]).toContain('#ORD-10');
  });

  it('keeps primary order actions visible and groups secondary actions accessibly', async () => {
    await render(
      <OrdersView
        orders={[{ id: 'ORD-1', orderNumber: 'ORD-1', customerName: 'عميل', customerPhone: '0500000001', deliveryDate: '2026-08-20', totalAmount: 100, paidAmount: 0, remainingAmount: 100, status: 'new' } as any]}
        customers={[]}
        fabrics={[]}
        accessories={[]}
        thobeTypes={[]}
        onSaveOrder={vi.fn()}
        onUpdateOrderStatus={vi.fn()}
        onSendWhatsAppNotice={vi.fn()}
        showToast={showToast}
      />
    );

    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'عرض')).not.toBeUndefined();
    expect(container.querySelector('button[aria-label="إرسال رسالة واتساب للطلب ORD-1"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="طباعة الطلب ORD-1"]')).not.toBeNull();
    expect(container.querySelector('details.sahwa-actions-menu')).not.toBeNull();
  });

  it('preserves long order values and accessible secondary actions with tooltips', async () => {
    const longName = 'عميل تجريبي باسم طويل جداً لاختبار عدم قص النصوص داخل جداول سطح المكتب';
    const longType = 'ثوب سعودي كلاسيك فاخر بتفاصيل يدوية وإضافات متعددة لاختبار عرض الخلية';
    await render(
      <OrdersView
        orders={[{ id: 'ORD-LONG', orderNumber: 'VISUAL-P1-9-LONG-ORDER', customerName: longName, customerPhone: '050123456789012345', deliveryDate: '2026-08-20', totalAmount: 350, paidAmount: 0, remainingAmount: 350, status: 'new', thobeTypeName: longType, fabricName: 'بدون قماش طويل', fabricColor: 'أبيض' } as any]}
        customers={[]}
        fabrics={[]}
        accessories={[]}
        thobeTypes={[]}
        onSaveOrder={vi.fn()}
        onUpdateOrderStatus={vi.fn()}
        onSendWhatsAppNotice={vi.fn()}
        showToast={showToast}
      />
    );

    expect(container.querySelector(`[title="${longName}"]`)).not.toBeNull();
    expect(container.querySelector(`[title="${longType}"]`)).not.toBeNull();
    const whatsapp = container.querySelector<HTMLButtonElement>('button[aria-label="إرسال رسالة واتساب للطلب VISUAL-P1-9-LONG-ORDER"]');
    const print = container.querySelector<HTMLButtonElement>('button[aria-label="طباعة الطلب VISUAL-P1-9-LONG-ORDER"]');
    expect(whatsapp).not.toBeNull();
    expect(print).not.toBeNull();
    expect(whatsapp?.getAttribute('aria-describedby')).toBeTruthy();
    expect(print?.getAttribute('aria-describedby')).toBeTruthy();
    expect(container.querySelector('details.sahwa-actions-menu')).not.toBeNull();
  });

  it('sorts fabrics by stock quantity when the inventory header is clicked', async () => {
    const fabrics: FabricItem[] = [
      { id: 'FAB-20', name: 'قماش ب', color: 'أبيض', purchasePrice: 40, sellingPrice: 100, quantityMeters: 20, minStockMeters: 5 },
      { id: 'FAB-5', name: 'قماش أ', color: 'أسود', purchasePrice: 40, sellingPrice: 100, quantityMeters: 5, minStockMeters: 5 }
    ];
    await render(
      <InventoryView
        fabrics={fabrics}
        accessories={[]}
        thobeTypes={[]}
        colors={[]}
        onSaveFabric={vi.fn()}
        onDeleteFabric={vi.fn()}
        onSaveAccessory={vi.fn()}
        onDeleteAccessory={vi.fn()}
        onSaveThobeType={vi.fn()}
        onDeleteThobeType={vi.fn()}
        onSaveColor={vi.fn()}
        onDeleteColor={vi.fn()}
        stockMovements={[]}
        showToast={showToast}
      />
    );

    const sortButton = container.querySelector<HTMLButtonElement>('button[aria-label="فرز حسب المخزون"]');
    expect(sortButton).not.toBeNull();
    expect(rowTexts()[0]).toContain('قماش أ');

    await act(async () => sortButton?.click());
    expect(sortButton?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(rowTexts()[0]).toContain('قماش أ');

    await act(async () => sortButton?.click());
    expect(sortButton?.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(rowTexts()[0]).toContain('قماش ب');
  });
});
