import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, initElectronMock } from '../services/electronMock';
import type { AppData } from '../types';
import { WhatsAppService } from '../electron/services/whatsappService';

const seed = (): AppData => ({
  customers: [{ id: 'CUS-SEQ', name: 'عميل اختبار', phone: '0500000000', measurements: DEFAULT_MEASUREMENTS, styleDetails: DEFAULT_STYLE_DETAILS, measurementHistory: [], createdAt: '2026-08-20T00:00:00.000Z' }],
  orders: [], invoices: [],
  fabrics: [{ id: 'FAB-SEQ', name: 'قماش تسلسل', color: 'أبيض', purchasePrice: 10, sellingPrice: 100, quantityMeters: 30, minStockMeters: 2 }],
  accessories: [], thobeTypes: [], colors: [], notifications: [], stockMovements: [], purchases: [], expenses: [], cashTransactions: [], orderMaterialUsages: [], orderEvents: [], customerCredits: []
});

describe('IDs/sequences and Notifications lifecycle', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = { clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
    (globalThis as any).open = () => ({ closed: false });
    storage.setItem('sahwa_tailoring_app_data_v1', JSON.stringify(seed()));
    storage.removeItem('sahwa_tailoring_order_sequence_v1');
    initElectronMock();
  });

  it('serializes concurrent Mock order creation without duplicate or unacceptable gaps', async () => {
    const create = (id: string) => window.electronAPI.createOrder({
      id, customerId: 'CUS-SEQ', customerName: 'عميل اختبار', customerPhone: '0500000000',
      fabricId: 'FAB-SEQ', fabricName: 'قماش تسلسل', fabricColor: 'أبيض', garmentCount: 1,
      totalAmount: 100, paidAmount: 0, orderDate: '2026-08-20', deliveryDate: '2026-08-21', measurements: DEFAULT_MEASUREMENTS, styleDetails: DEFAULT_STYLE_DETAILS
    });
    const [first, second] = await Promise.all([create('ORD-SEQ-1'), create('ORD-SEQ-2')]);
    const numbers = [first.orderNumber, second.orderNumber].sort();
    expect(numbers).toEqual(['1001', '1002']);
    expect(new Set(numbers).size).toBe(2);
    expect((await window.electronAPI.getInvoices()).map((invoice) => invoice.invoiceNumber).sort()).toEqual(['INV-1001', 'INV-1002']);
  });

  it('normalizes production WhatsApp phone numbers before building wa.me URLs', () => {
    const service = new WhatsAppService(
      {} as any,
      { findByOrderNumber: () => undefined } as any,
      {} as any
    );
    const prepared = service.prepareMessage('+966 (50) 123-4567', 'عميل اختبار', '1001', 'جاهز');
    const parsedUrl = new URL(prepared.url);
    expect(parsedUrl.hostname).toBe('wa.me');
    expect(parsedUrl.pathname).toBe('/966501234567');
    expect(parsedUrl.searchParams.get('text')).toContain('عميل اختبار');
  });

  it('upserts WhatsApp notifications by source and preserves sent status', async () => {
    const sent = await window.electronAPI.sendWhatsAppNotice({ phone: '0500000000', customerName: 'عميل اختبار', orderNumber: '1001', statusText: 'جاهز' });
    expect(sent).toBe(true);
    const again = await window.electronAPI.sendWhatsAppNotice({ phone: '0500000000', customerName: 'عميل اختبار', orderNumber: '1001', statusText: 'جاهز' });
    expect(again).toBe(true);
    const notifications = await window.electronAPI.notifications?.list(true);
    expect(notifications).toHaveLength(1);
    expect(notifications?.[0].status).toBe('sent');
    expect(notifications?.[0].source).toBe('whatsapp');
    expect(notifications?.[0].sourceId).toBe('0500000000|1001|جاهز');
  });

  it('does not let a stale save overwrite a newer WhatsApp notification', async () => {
    const staleSnapshot = await window.electronAPI.getData();
    expect(staleSnapshot.notifications).toHaveLength(0);

    await window.electronAPI.sendWhatsAppNotice({ phone: '0500000000', customerName: 'عميل اختبار', orderNumber: '1001', statusText: 'جاهز' });
    const before = await window.electronAPI.notifications?.list(true);
    expect(before?.[0]).toMatchObject({ status: 'sent', source: 'whatsapp' });

    // Simulate a normal save triggered by another feature while this renderer
    // still holds the pre-WhatsApp notification snapshot.
    await window.electronAPI.saveData(staleSnapshot);

    const after = await window.electronAPI.notifications?.list(true);
    expect(after).toHaveLength(1);
    expect(after?.[0]).toMatchObject({ status: 'sent', source: 'whatsapp' });
  });

  it('marks all read and archives without deleting notifications', async () => {
    await window.electronAPI.sendWhatsAppNotice({ phone: '0500000000', customerName: 'عميل اختبار', orderNumber: '1001', statusText: 'جاهز' });
    const before = await window.electronAPI.notifications?.list(true);
    expect(before).toHaveLength(1);
    expect((await window.electronAPI.notifications?.markAllRead())?.updated).toBe(1);
    expect((await window.electronAPI.notifications?.clearAll())?.archived).toBe(1);
    expect(await window.electronAPI.notifications?.list()).toHaveLength(0);
    expect(await window.electronAPI.notifications?.list(true)).toHaveLength(1);
    expect((await window.electronAPI.notifications?.list(true))?.[0].readAt).toBeTruthy();
    expect((await window.electronAPI.notifications?.list(true))?.[0].archivedAt).toBeTruthy();
  });

  it('records WhatsApp failure and enforces bounded retry history', async () => {
    (globalThis as any).open = () => { throw new Error('browser unavailable'); };
    expect(await window.electronAPI.sendWhatsAppNotice({ phone: '0500000000', customerName: 'عميل اختبار', orderNumber: '1001', statusText: 'فشل' })).toBe(false);
    const failed = (await window.electronAPI.notifications?.list(true))?.[0];
    expect(failed?.status).toBe('failed');
    expect(failed?.lastError).toContain('browser unavailable');
    const id = failed!.id;
    await window.electronAPI.notifications?.retry(id);
    await window.electronAPI.notifications?.retry(id);
    await window.electronAPI.notifications?.retry(id);
    await expect(window.electronAPI.notifications?.retry(id)).rejects.toThrow(/الحد الأقصى/);
    const retried = (await window.electronAPI.notifications?.list(true))?.[0];
    expect(retried?.retryCount).toBe(3);
    expect(retried?.retryHistory).toHaveLength(4);
  });
});
