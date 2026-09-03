// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { OrdersView } from '../components/OrdersView';

let root: Root;
let container: HTMLDivElement;

const baseOrder = {
  id: 'ORD-ACCEPT-1',
  orderNumber: 'VISUAL-ACCEPT-1001',
  customerId: 'CUS-ACCEPT-1',
  customerName: 'عميل اختبار باسم طويل لمسار تفاصيل الطلب',
  customerPhone: '050123456789012345',
  thobeTypeId: 'THB-1',
  thobeTypeName: 'ثوب سعودي كلاسيك فاخر',
  fabricId: 'FAB-1',
  fabricName: 'قماش كحلي فاخر',
  fabricColor: 'كحلي داكن',
  orderDate: '2026-08-20',
  deliveryDate: '2026-08-30',
  status: 'new' as const,
  totalAmount: 987654.32,
  paidAmount: 123456.78,
  remainingAmount: 864197.54,
  isCustomMeasurement: true,
  measurements: {},
  styleDetails: {},
  notes: 'ملاحظة طويلة لاختبار عدم قص المحتوى في تفاصيل الطلب.',
  createdAt: '2026-08-20T09:00:00.000Z'
};

describe('Order Details P1 acceptance flow', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.electronAPI = { getOrderEvents: vi.fn().mockResolvedValue([]) } as any;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('opens details, exposes the dialog, and restores focus after Escape', async () => {
    await act(async () => root.render(
      <OrdersView
        orders={[baseOrder]}
        customers={[]}
        fabrics={[]}
        accessories={[]}
        thobeTypes={[]}
        onSaveOrder={vi.fn()}
        onUpdateOrderStatus={vi.fn()}
        onSendWhatsAppNotice={vi.fn()}
        showToast={vi.fn()}
      />
    ));

    const viewButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'عرض') as HTMLButtonElement;
    expect(viewButton).toBeTruthy();

    viewButton.focus();
    await act(async () => viewButton.click());
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('عميل اختبار باسم طويل لمسار تفاصيل الطلب');
    expect(dialog?.textContent).toContain('987654.32');

    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(viewButton);
  });
});
