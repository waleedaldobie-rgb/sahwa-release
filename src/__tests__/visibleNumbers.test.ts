// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { AppData } from '../types';
import { db, DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, initElectronMock } from '../services/electronMock';

const emptyData = (): AppData => ({
  customers: [], orders: [], invoices: [], fabrics: [], accessories: [], thobeTypes: [], colors: [],
  notifications: [], stockMovements: [], purchases: [], expenses: [], cashTransactions: [],
  orderMaterialUsages: [], orderEvents: [], customerCredits: []
});

describe('visible customer and invoice numbers', () => {
  beforeEach(() => {
    localStorage.clear();
    initElectronMock();
  });

  it('assigns customer numbers from 1 and preserves them on update', async () => {
    const first = await window.electronAPI.createCustomer({ id: 'CUST-1', name: 'الأول', phone: '0500000001' });
    const second = await window.electronAPI.createCustomer({ id: 'CUST-2', name: 'الثاني', phone: '0500000002' });
    expect(first.customerNumber).toBe(1);
    expect(second.customerNumber).toBe(2);

    await window.electronAPI.updateCustomer({ ...first, name: 'الأول بعد التعديل' });
    const customers = await window.electronAPI.getCustomers();
    expect(customers.find((customer) => customer.id === first.id)?.customerNumber).toBe(1);
    expect(customers.find((customer) => customer.id === first.id)?.name).toBe('الأول بعد التعديل');
  });

  it('assigns independent invoice display numbers while preserving legacy invoiceNumber', async () => {
    const customer = await window.electronAPI.createCustomer({ id: 'CUST-INVOICE', name: 'عميل فواتير', phone: '0500000010', measurements: DEFAULT_MEASUREMENTS, styleDetails: DEFAULT_STYLE_DETAILS });
    const first = await window.electronAPI.createOrder({
      id: 'ORD-1', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
      totalAmount: 100, paidAmount: 0, orderDate: '2026-08-01', measurements: DEFAULT_MEASUREMENTS, styleDetails: DEFAULT_STYLE_DETAILS
    });
    const second = await window.electronAPI.createOrder({
      id: 'ORD-2', customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
      totalAmount: 200, paidAmount: 0, orderDate: '2026-08-02', measurements: DEFAULT_MEASUREMENTS, styleDetails: DEFAULT_STYLE_DETAILS
    });
    const invoices = await window.electronAPI.getInvoices();
    const firstInvoice = invoices.find((invoice) => invoice.orderId === first.id)!;
    const secondInvoice = invoices.find((invoice) => invoice.orderId === second.id)!;
    expect(firstInvoice.visibleInvoiceNumber).toBe(1);
    expect(secondInvoice.visibleInvoiceNumber).toBe(2);
    expect(firstInvoice.invoiceNumber).toBe(`INV-${first.orderNumber}`);
    expect(secondInvoice.invoiceNumber).toBe(`INV-${second.orderNumber}`);
  });

  it('backfills legacy mock data deterministically without changing internal IDs', async () => {
    const legacy = emptyData();
    legacy.customers = [
      { id: 'CUST-LATE', name: 'متأخر', phone: '0500000020', createdAt: '2026-02-01', measurements: DEFAULT_MEASUREMENTS, styleDetails: DEFAULT_STYLE_DETAILS, measurementHistory: [] },
      { id: 'CUST-EARLY', name: 'مبكر', phone: '0500000021', createdAt: '2026-01-01', measurements: DEFAULT_MEASUREMENTS, styleDetails: DEFAULT_STYLE_DETAILS, measurementHistory: [] }
    ];
    legacy.invoices = [
      { id: 'INV-LATE', invoiceNumber: 'INV-1002', orderId: 'ORD-LATE', customerName: 'متأخر', customerPhone: '0500000020', orderDate: '2026-02-01', totalAmount: 100, paidAmount: 0, remainingAmount: 100, paymentStatus: 'unpaid', payments: [] },
      { id: 'INV-EARLY', invoiceNumber: 'INV-1001', orderId: 'ORD-EARLY', customerName: 'مبكر', customerPhone: '0500000021', orderDate: '2026-01-01', totalAmount: 100, paidAmount: 0, remainingAmount: 100, paymentStatus: 'unpaid', payments: [] }
    ];
    localStorage.setItem('sahwa_tailoring_app_data_v1', JSON.stringify(legacy));
    const restored = await window.electronAPI.getData();
    expect(restored.customers.find((customer) => customer.id === 'CUST-EARLY')?.customerNumber).toBe(1);
    expect(restored.customers.find((customer) => customer.id === 'CUST-LATE')?.customerNumber).toBe(2);
    expect(restored.invoices.find((invoice) => invoice.id === 'INV-EARLY')?.visibleInvoiceNumber).toBe(1);
    expect(restored.invoices.find((invoice) => invoice.id === 'INV-LATE')?.visibleInvoiceNumber).toBe(2);
  });

  it('does not alter customer or invoice internal IDs when assigning visible numbers', async () => {
    const customer = await window.electronAPI.createCustomer({ name: 'ثابت', phone: '0500000030' });
    const order = await window.electronAPI.createOrder({ customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, totalAmount: 100, paidAmount: 0 });
    const data = await window.electronAPI.getData();
    expect(data.customers[0].id).toBe(customer.id);
    expect(data.invoices[0].id).toBe(`INV-${order.orderNumber}`);
  });
});
