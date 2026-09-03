// @ts-nocheck
// كل قاعدة مالية هنا يجب أن تكون استدعاءً لدوال src/domain — ممنوع كتابة حساب جديد هنا.
import { AppData, UserPreferences, Customer, CustomerMeasurements, CustomerStyleDetails, Order, Invoice, FabricItem, AccessoryItem, ThobeType, ColorItem, NotificationItem,   PaymentRecord, StockMovement, PurchaseRecord, PurchaseLine, ExpenseRecord, CashTransaction, OrderMaterialUsage, OrderEvent, MeasurementHistoryRecord, CustomerCreditRecord, CustomerCreditApplyRequest, CustomerCreditHistoryFilters, CustomerCreditOperationResult, CustomerCreditRefundRequest, CustomerCreditSummary, InventoryItemType, AddPaymentRequest, AdjustStockRequest, ReturnPurchaseRequest, UpdateOrderStatusRequest, WhatsAppSendRequest, SettingsUpdateRequest } from '../types';
import { checkAndSyncStockAlerts } from '../utils/stockAlerts';
import { calculateStockBalance, round2 } from './shared/inventoryRules';
import { ALLOWED_ORDER_STATUS_TRANSITIONS, assertSafeInitialOrderStatus } from '../domain/orderRules';
import { assertCashTransactionContract } from '../domain/cashRules';
import { calculateMaterialCost, calculateOrderAmounts } from './shared/orderRules';
import { assertStoredPaymentAggregates, assertValidPaymentMethod, calculatePaymentUpdate } from '../domain/paymentRules';
import { createSafeId } from '../domain/idGenerator';
import { normalizePositiveAmount } from '../domain/amountRules';
import { applyPaymentToDraft } from './adapters/paymentDraftAdapter';
import { applyCustomerCreditInDraft, createCustomerCreditFromOverpaymentInDraft, getCustomerCreditHistoryInDraft, getCustomerCreditOperationInDraft, getCustomerCreditSummaryInDraft, refundCustomerCreditInDraft } from './adapters/customerCreditDraftAdapter';
import { assertMockBusinessIntegrity } from './adapters/mockIntegrityAdapter';
import { settleCancelledOrderInDraft } from './adapters/orderSettlementAdapter';
import { applyExpenseToDraft, applyCashAdjustmentToDraft } from './adapters/accountingDraftAdapter';
import { createCustomerInDraft, updateCustomerInDraft, saveCustomerMeasurementHistoryInDraft } from './adapters/customerDraftAdapter';
import { createFabricInDraft, updateFabricInDraft, createAccessoryInDraft, updateAccessoryInDraft } from './adapters/inventoryCatalogDraftAdapter';
import { createPurchaseInDraft, getInventoryMeta, insertStockMovementInDraft, returnPurchaseInDraft } from './adapters/inventoryMovementDraftAdapter';
import { appendMaterialUsage, buildFabricMaterialUsage, buildInitialInvoiceDraft, buildMaterialUsage, buildOrderDraft, calculateOrderMaterialCost } from './adapters/orderDraftAdapter';
import { updateOrderMaterialsInDraft, updateOrderInvoiceInDraft } from './adapters/orderUpdateAdapter';
import { findById, hasIdOrSourceId } from './shared/idempotencyRules';
import { paginateOrders } from '../application/ordersPagination';

const STORAGE_KEY = 'sahwa_tailoring_app_data_v1';
const PREFS_KEY = 'sahwa_tailoring_prefs_v1';
const ORDER_SEQUENCE_KEY = 'sahwa_tailoring_order_sequence_v1';

function nextMockOrderNumber(orders: Order[]): string {
  const maxExisting = orders.reduce((max, order) => Math.max(max, Number(order.orderNumber) || 1000), 1000);
  const stored = Number(window.localStorage.getItem(ORDER_SEQUENCE_KEY) || 1000);
  const next = Math.max(maxExisting, stored) + 1;
  window.localStorage.setItem(ORDER_SEQUENCE_KEY, String(next));
  return String(next);
}

function nextMockCustomerNumber(customers: Customer[]): number {
  return customers.reduce((max, customer) => Math.max(max, Number(customer.customerNumber) || 0), 0) + 1;
}

function nextMockInvoiceNumber(invoices: Invoice[]): number {
  return invoices.reduce((max, invoice) => Math.max(max, Number(invoice.visibleInvoiceNumber) || 0), 0) + 1;
}

function backfillVisibleNumbers<T extends { id: string }>(
  items: T[],
  getNumber: (item: T) => number | undefined,
  setNumber: (item: T, number: number) => T,
  compare: (left: T, right: T) => number,
): T[] {
  let next = items.reduce((max, item) => Math.max(max, Number(getNumber(item)) || 0), 0) + 1;
  return items.map((item) => item).map((item, index, source) => {
    if (Number(getNumber(item)) > 0) return item;
    const missing = source.filter((candidate) => !(Number(getNumber(candidate)) > 0)).sort(compare);
    const missingIndex = missing.findIndex((candidate) => candidate.id === item.id);
    return missingIndex >= 0 ? setNumber(item, next + missingIndex) : item;
  });
}

function normalizeVisibleNumbers(rawCustomers: Customer[], rawInvoices: Invoice[]): { customers: Customer[]; invoices: Invoice[] } {
  const customers = backfillVisibleNumbers(
    rawCustomers,
    (customer) => customer.customerNumber,
    (customer, number) => ({ ...customer, customerNumber: number }),
    (left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')) || left.id.localeCompare(right.id),
  );
  const invoices = backfillVisibleNumbers(
    rawInvoices,
    (invoice) => invoice.visibleInvoiceNumber,
    (invoice, number) => ({ ...invoice, visibleInvoiceNumber: number }),
    (left, right) => String(left.orderDate || '').localeCompare(String(right.orderDate || '')) || left.id.localeCompare(right.id),
  );
  return { customers, invoices };
}

import { DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, EMPTY_MEASUREMENTS, EMPTY_STYLE_DETAILS, normalizeMeasurements, normalizeStyleDetails } from './shared/measurementDefaults';
export { DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, EMPTY_MEASUREMENTS, EMPTY_STYLE_DETAILS, normalizeMeasurements, normalizeStyleDetails } from './shared/measurementDefaults';

// Initial Seed Data (Empty by default per user request - no demo/sample data)
const INITIAL_CUSTOMERS: Customer[] = [];

const INITIAL_FABRICS: FabricItem[] = [];

const INITIAL_ACCESSORIES: AccessoryItem[] = [];

const INITIAL_THOBE_TYPES: ThobeType[] = [
  { id: 'THB-01', name: 'ثوب سعودي كلاسيك', defaultPrice: 220, description: 'الرقبة القلاب القياسية والكبك التقليدي' },
  { id: 'THB-02', name: 'ثوب كويتي فتحة صليب', defaultPrice: 240, description: 'بدون قلاب مع قَصّة كويتية ممتازة' },
  { id: 'THB-03', name: 'ثوب قطري جيب بارز', defaultPrice: 250, description: 'ياقة مرتفعة وجيب صدر مطرز' },
  { id: 'THB-04', name: 'ثوب سحاب مخفي رسمي', defaultPrice: 230, description: 'سحاب مخفي وعملي للدوامات' }
];

const INITIAL_COLORS: ColorItem[] = [
  { id: 'COL-01', name: 'أبيض ناصع', hex: '#ffffff' },
  { id: 'COL-02', name: 'أبيض نص لمعة', hex: '#f8fafc' },
  { id: 'COL-03', name: 'كريمي فاتح', hex: '#fef3c7' },
  { id: 'COL-04', name: 'أوف وايت', hex: '#f5f5f4' },
  { id: 'COL-05', name: 'كحلي داكن', hex: '#1e293b' },
  { id: 'COL-06', name: 'رمادي رصاصي', hex: '#475569' }
];

const INITIAL_ORDERS: Order[] = [];

const INITIAL_INVOICES: Invoice[] = [];

const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

const INITIAL_APP_DATA: AppData = {
  customers: INITIAL_CUSTOMERS,
  orders: INITIAL_ORDERS,
  invoices: INITIAL_INVOICES,
  fabrics: INITIAL_FABRICS,
  accessories: INITIAL_ACCESSORIES,
  thobeTypes: INITIAL_THOBE_TYPES,
  colors: INITIAL_COLORS,
  notifications: INITIAL_NOTIFICATIONS,
  stockMovements: [],
  purchases: [],
  expenses: [],
  cashTransactions: [],
  orderMaterialUsages: [],
  orderEvents: [],
  customerCredits: []
};

const INITIAL_PREFS: UserPreferences = {
  activeTab: 'dashboard',
  invoicePrintMode: 'detailed',
  managerName: 'حاتم محمد الدبعي'
};

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (item && item.id && !seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

const normalizeCustomer = (customer: Customer): Customer => ({
  ...customer,
  measurements: normalizeMeasurements(customer.measurements),
  styleDetails: normalizeStyleDetails(customer.styleDetails),
  measurementHistory: Array.isArray(customer.measurementHistory)
    ? customer.measurementHistory.map((history) => ({
        ...history,
        measurements: normalizeMeasurements(history.measurements),
        styleDetails: normalizeStyleDetails(history.styleDetails),
      }))
    : [],
});

const normalizeOrder = (order: Order): Order => ({
  ...order,
  measurements: normalizeMeasurements(order.measurements),
  styleDetails: normalizeStyleDetails(order.styleDetails),
});

function sanitizeAppData(raw: Partial<AppData>): AppData {
  const visibleNumbers = normalizeVisibleNumbers(
    deduplicateById(raw.customers || INITIAL_CUSTOMERS).map(normalizeCustomer),
    deduplicateById(raw.invoices || INITIAL_INVOICES),
  );
  return {
    customers: visibleNumbers.customers,
    orders: deduplicateById(raw.orders || INITIAL_ORDERS).map(normalizeOrder),
    invoices: visibleNumbers.invoices,
    fabrics: deduplicateById(raw.fabrics || INITIAL_FABRICS),
    accessories: deduplicateById(raw.accessories || INITIAL_ACCESSORIES),
    thobeTypes: deduplicateById(raw.thobeTypes || INITIAL_THOBE_TYPES),
    colors: deduplicateById(raw.colors || INITIAL_COLORS),
    notifications: deduplicateById(raw.notifications || INITIAL_NOTIFICATIONS),
    stockMovements: deduplicateById(raw.stockMovements || []),
    purchases: deduplicateById(raw.purchases || []),
    expenses: deduplicateById(raw.expenses || []),
    cashTransactions: deduplicateById(raw.cashTransactions || []),
    orderMaterialUsages: deduplicateById(raw.orderMaterialUsages || []),
    orderEvents: deduplicateById(raw.orderEvents || []),
    customerCredits: deduplicateById(raw.customerCredits || []) as CustomerCreditRecord[]
  };
}

// Atomic Database Transaction Manager
let transactionTail: Promise<void> = Promise.resolve();

export const db = {
  /**
   * Executes a callback atomically inside a database transaction on AppData.
   * Clones current AppData into an isolated draft.
   * If action fails/throws, transaction rolls back cleanly without persisting changes.
   * If action succeeds, draft is sanitized, stock alerts synced, and committed atomically to storage.
   */
  async transaction<T>(
    action: (draft: AppData) => Promise<T> | T
  ): Promise<{ result: T; updatedData: AppData; alertMessages: string[] }> {
    const previous = transactionTail;
    let release!: () => void;
    transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const currentData = await window.electronAPI.getData();
      const draft: AppData = JSON.parse(JSON.stringify(currentData));
      const result = await action(draft);
      const { updatedData, alertMessages } = checkAndSyncStockAlerts(draft);
      assertMockBusinessIntegrity(updatedData);
      const saved = await window.electronAPI.saveData(updatedData);
      if (!saved) throw new Error('فشل الترانزاكشن: تعذر حفظ البيانات في وحدة التخزين');
      return { result, updatedData, alertMessages };
    } catch (err) {
      console.error('[db.transaction] Transaction rolled back due to error:', err);
      throw err;
    } finally {
      release();
    }
  }
};

const mockInsertCash = (draft: AppData, transaction: CashTransaction) => {
  assertCashTransactionContract(transaction);
  const cashTransactions = draft.cashTransactions || [];
  if (hasIdOrSourceId(cashTransactions, transaction.id, transaction.sourceId)) return;
  draft.cashTransactions = [transaction, ...cashTransactions];
};

const mockInsertEvent = (draft: AppData, event: OrderEvent) => {
  const orderEvents = draft.orderEvents || [];
  if (findById(orderEvents, event.id)) return;
  draft.orderEvents = [event, ...orderEvents];
};

const MAX_NOTIFICATION_RETRIES = 3;
const notificationSourceId = (phone: string, orderNumber: string, statusText: string) => `${phone}|${orderNumber}|${statusText}`;

const upsertNotificationInDraft = (draft: AppData, notification: NotificationItem): NotificationItem => {
  const source = notification.source || 'renderer';
  const sourceId = notification.sourceId || notification.id;
  const existingIndex = (draft.notifications || []).findIndex((item) => item.id === notification.id || (item.source === source && item.sourceId === sourceId));
  const now = new Date().toISOString();
  const merged: NotificationItem = {
    ...(existingIndex >= 0 ? draft.notifications[existingIndex] : {}),
    ...notification,
    source,
    sourceId,
    status: notification.status || 'sent',
    retryCount: notification.retryCount || 0,
    retryHistory: notification.retryHistory || [],
    createdAt: existingIndex >= 0 ? draft.notifications[existingIndex].createdAt || now : notification.createdAt || now,
    updatedAt: now
  };
  if (existingIndex >= 0) draft.notifications[existingIndex] = merged;
  else draft.notifications = [merged, ...(draft.notifications || [])];
  return merged;
};


// Setup window.electronAPI mock
export function initElectronMock() {
  if (typeof window === 'undefined') return;

  const existing = window.electronAPI;
  const isRealElectron = existing && !(existing as any).__isMock;

  // Electron preload exposes a read-only contextBridge API. Never replace it
  // with the browser mock; use the mock only when running outside Electron.
  if (isRealElectron) return;

  window.electronAPI = {
    __isMock: true,
    ...existing,
    db,

    async getData(): Promise<AppData> {
      if (isRealElectron && existing?.getCustomers && existing?.getOrders && existing?.getInvoices && existing?.getFabrics && existing?.getAccessories) {
        try {
          const [customers, orders, invoices, fabrics, accessories, thobeTypes, colors, stockMovements, purchases, expenses, cashTransactions, orderMaterialUsages, orderEvents, customerCredits, notifications] = await Promise.all([
            existing.getCustomers(),
            existing.getOrders(),
            existing.getInvoices(),
            existing.getFabrics(),
            existing.getAccessories(),
            existing.getThobeTypes?.() ?? Promise.resolve(INITIAL_THOBE_TYPES),
            existing.getColors?.() ?? Promise.resolve(INITIAL_COLORS),
            existing.getStockMovements?.() ?? Promise.resolve([]),
            existing.getPurchases?.() ?? Promise.resolve([]),
            existing.getExpenses?.() ?? Promise.resolve([]),
            existing.getCashTransactions?.() ?? Promise.resolve([]),
            existing.getOrderMaterialUsages?.() ?? Promise.resolve([]),
            existing.getOrderEvents?.() ?? Promise.resolve([]),
            (existing as any).getCustomerCredits?.() || Promise.resolve([]),
            (existing as any).notifications?.list?.() || Promise.resolve([])
          ]);
          return sanitizeAppData({
            customers: customers || [],
            orders: orders || [],
            invoices: invoices || [],
            fabrics: fabrics || [],
            accessories: accessories || [],
            thobeTypes: thobeTypes || INITIAL_THOBE_TYPES,
            colors: colors || INITIAL_COLORS,
            notifications: notifications || [],
            stockMovements: stockMovements || [],
            purchases: purchases || [],
            expenses: expenses || [],
            cashTransactions: cashTransactions || [],
            orderMaterialUsages: orderMaterialUsages || [],
            orderEvents: orderEvents || [],
            customerCredits: customerCredits || []
          });
        } catch (err) {
          console.error('Error loading real Electron SQLite data, falling back to localStorage:', err);
        }
      }

      try {
        const noDemoFlag = localStorage.getItem('sahwa_no_demo_v2');
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // If stored has old demo customers like CUST-101 and noDemoFlag is not set, purge them
          const hasDemoData = parsed.customers?.some((c: any) => c.id === 'CUST-101');
          if (hasDemoData && !noDemoFlag) {
            localStorage.setItem('sahwa_no_demo_v2', 'true');
            const cleanData: AppData = {
              customers: [],
              orders: [],
              invoices: [],
              fabrics: [],
              accessories: [],
              thobeTypes: INITIAL_THOBE_TYPES,
              colors: INITIAL_COLORS,
              notifications: [],
              stockMovements: [],
              purchases: [],
              expenses: [],
              cashTransactions: [],
              orderMaterialUsages: [],
              orderEvents: [],
              customerCredits: []
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));
            return cleanData;
          }

          const sanitized = sanitizeAppData(parsed);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
          return sanitized;
        }
      } catch (e) {
        console.error('Failed to load data from localStorage', e);
      }
      
      const isCleared = localStorage.getItem('sahwa_tailoring_is_cleared') === 'true';
      if (isCleared) {
        const emptyData: AppData = {
          customers: [],
          orders: [],
          invoices: [],
          fabrics: [],
          accessories: [],
          thobeTypes: INITIAL_THOBE_TYPES,
          colors: INITIAL_COLORS,
          notifications: [],
          stockMovements: [],
          purchases: [],
          expenses: [],
          cashTransactions: [],
          orderMaterialUsages: [],
          orderEvents: [],
          customerCredits: []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData));
        return emptyData;
      }

      const initial = sanitizeAppData(INITIAL_APP_DATA);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    },

    async saveData(data: AppData): Promise<boolean> {
      try {
        const { updatedData } = checkAndSyncStockAlerts(data);
        const sanitized = sanitizeAppData(updatedData);
        assertMockBusinessIntegrity(sanitized);

        // Keep renderer-owned stock alerts synchronized, but never let a stale
        // renderer snapshot overwrite server-owned notification lifecycle fields
        // (WhatsApp status/retry/read state). This mirrors the production IPC
        // contract where data:save synchronizes only stock-alert notifications.
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        if (currentRaw) {
          const current = sanitizeAppData(JSON.parse(currentRaw) as AppData);
          const stockIds = new Set(
            sanitized.notifications
              .filter((n) => n.type === 'stock' && (n.id.startsWith('NOTIF-FAB-') || n.id.startsWith('NOTIF-ACC-')))
              .map((n) => n.id)
          );
          const currentNonStock = current.notifications.filter((n) => n.type !== 'stock');
          const incomingNonStock = sanitized.notifications.filter((n) => n.type !== 'stock');
          const currentStockById = new Map(current.notifications.filter((n) => n.type === 'stock').map((n) => [n.id, n]));
          const nextStock = sanitized.notifications
            .filter((n) => n.type === 'stock' && (n.id.startsWith('NOTIF-FAB-') || n.id.startsWith('NOTIF-ACC-')))
            .map((n) => {
              const existing = currentStockById.get(n.id);
              return existing ? { ...existing, title: n.title, message: n.message, date: n.date, read: n.read, archivedAt: undefined } : n;
            });

          // Merge server-owned/non-stock notifications by identity and timestamp.
          // This keeps a newly-created or newer WhatsApp result, while a stale
          // renderer snapshot cannot remove or roll back the current lifecycle.
          const mergedNonStock = [...currentNonStock];
          const notificationKey = (notification: NotificationItem) => `${notification.source || 'renderer'}|${notification.sourceId || notification.id}`;
          for (const incoming of incomingNonStock) {
            const incomingKey = notificationKey(incoming);
            const existingIndex = mergedNonStock.findIndex((currentItem) => notificationKey(currentItem) === incomingKey);
            if (existingIndex < 0) {
              mergedNonStock.push(incoming);
              continue;
            }
            const existing = mergedNonStock[existingIndex];
            const incomingTime = Date.parse(incoming.updatedAt || incoming.createdAt || '') || 0;
            const existingTime = Date.parse(existing.updatedAt || existing.createdAt || '') || 0;
            if (incomingTime >= existingTime) mergedNonStock[existingIndex] = incoming;
          }
          sanitized.notifications = [...nextStock, ...mergedNonStock];
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        return true;
      } catch (e) {
        console.error('Failed to save data', e);
        return false;
      }
    },

    async exportBackup(): Promise<string> {
      if (isRealElectron && existing?.exportBackup) return existing.exportBackup();
      const data = await window.electronAPI.getData();
      return JSON.stringify(data, null, 2);
    },

    async importBackup(jsonContent: string): Promise<{ success: boolean; error?: string }> {
      if (isRealElectron && existing?.importBackup) return existing.importBackup(jsonContent);
      try {
        const parsed = JSON.parse(jsonContent);
        if (!parsed.customers || !parsed.orders || !parsed.fabrics) {
          return { success: false, error: 'تنسيق الملف غير صحيح! يجب أن يحتوي على بيانات العملاء والطلبات والمخزون.' };
        }
        const sanitized = sanitizeAppData(parsed);
        assertMockBusinessIntegrity(sanitized);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        return { success: true };
      } catch (e) {
        return { success: false, error: 'عذراً، تعذر قراءة ملف JSON. يرجى التاكد من سلامة الملف.' };
      }
    },

    async getPreferences(): Promise<UserPreferences> {
      try {
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          return { ...INITIAL_PREFS, ...JSON.parse(stored) };
        }
      } catch (e) {
        console.error('Failed to load preferences', e);
      }
      return INITIAL_PREFS;
    },

    async savePreferences(prefs: Partial<UserPreferences>): Promise<boolean> {
      try {
        const current = await window.electronAPI.getPreferences();
        const updated = { ...current, ...prefs };
        localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
        return true;
      } catch (e) {
        return false;
      }
    },

    async clearAllData(): Promise<boolean> {
      try {
        const clearedData: AppData = {
          customers: [],
          orders: [],
          invoices: [],
          fabrics: [],
          accessories: [],
          thobeTypes: INITIAL_THOBE_TYPES,
          colors: INITIAL_COLORS,
          notifications: [],
          customerCredits: []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clearedData));
        // Save a flag to indicate the mock data was explicitly cleared and shouldn't be reseeded
        localStorage.setItem('sahwa_tailoring_is_cleared', 'true');
        return true;
      } catch (e) {
        console.error('Failed to clear data', e);
        return false;
      }
    },

    async deleteFabric(id: string): Promise<boolean> {
      if (isRealElectron && existing?.deleteFabric) return existing.deleteFabric(id);
      await db.transaction((draft) => {
        const isUsed = draft.orders.some((o) => o.fabricId === id && (o.status as string) !== 'cancelled');
        if (isUsed) {
          throw new Error('لا يمكن حذف هذا الصنف لارتباطه بطلبات موجودة');
        }
        draft.fabrics = draft.fabrics.filter((f) => f.id !== id);
      });
      return true;
    },

    async deleteCustomer(id: string): Promise<boolean> {
      if (isRealElectron && existing?.deleteCustomer) return existing.deleteCustomer(id);
      await db.transaction((draft) => {
        const hasOrders = draft.orders.some((o) => o.customerId === id);
        if (hasOrders) {
          throw new Error('لا يمكن حذف هذا الصنف لارتباطه بطلبات موجودة');
        }
        draft.customers = draft.customers.filter((c) => c.id !== id);
      });
      return true;
    },

    async deleteAccessory(id: string): Promise<boolean> {
      if (isRealElectron && existing?.deleteAccessory) return existing.deleteAccessory(id);
      await db.transaction((draft) => {
        draft.accessories = draft.accessories.filter((a) => a.id !== id);
      });
      return true;
    },

    async deleteOrder(id: string): Promise<boolean> {
      if (isRealElectron && existing?.deleteOrder) return existing.deleteOrder(id);
      await db.transaction((draft) => {
        const order = draft.orders.find((item) => item.id === id);
        if (!order) return;
        const invoice = draft.invoices.find((item) => item.orderId === id);
        const credits = (draft.customerCredits || []).filter((credit) => credit.orderId === id || credit.invoiceId === invoice?.id);
        if (invoice || credits.length > 0) {
          throw new Error('لا يمكن حذف طلب له فاتورة أو سجل مالي؛ استخدم مسار الأرشفة');
        }
        const usages = (draft.orderMaterialUsages || []).filter((usage) => usage.orderId === id);
        if ((order.status as string) !== 'cancelled') {
          for (const usage of usages) {
            if (usage.itemId) insertStockMovementInDraft(draft, usage.itemType, usage.itemId, usage.quantity, 'return', 'إرجاع مواد بسبب حذف الطلب', { type: 'order_delete', id });
          }
        }
        draft.orderMaterialUsages = (draft.orderMaterialUsages || []).filter((usage) => usage.orderId !== id);
        draft.orderEvents = (draft.orderEvents || []).filter((event) => event.orderId !== id);
        draft.orders = draft.orders.filter((item) => item.id !== id);
      });
      return true;
    },

    async getCustomers(): Promise<Customer[]> {
      if (isRealElectron && existing?.getCustomers) return existing.getCustomers();
      const data = await window.electronAPI.getData();
      return data.customers;
    },

    async createCustomer(customer: Partial<Customer>): Promise<Customer> {
      if (isRealElectron && existing?.createCustomer) return existing.createCustomer(customer);
      let newCustomer!: Customer;
      await db.transaction((draft) => {
        newCustomer = createCustomerInDraft(draft, customer);
      });
      return newCustomer;
    },

    async updateCustomer(customer: Customer): Promise<boolean> {
      if (isRealElectron && existing?.updateCustomer) return existing.updateCustomer(customer);
      await db.transaction((draft) => {
        updateCustomerInDraft(draft, customer);
      });
      return true;
    },

    async saveCustomerMeasurementHistory(id: string, note: string): Promise<MeasurementHistoryRecord> {
      if (isRealElectron && existing?.saveCustomerMeasurementHistory) return existing.saveCustomerMeasurementHistory(id, note);
      let newHistory!: MeasurementHistoryRecord;
      await db.transaction((draft) => {
        newHistory = saveCustomerMeasurementHistoryInDraft(draft, id, note);
      });
      return newHistory;
    },

    async getFabrics(): Promise<FabricItem[]> {
      if (isRealElectron && existing?.getFabrics) return existing.getFabrics();
      const data = await window.electronAPI.getData();
      return data.fabrics;
    },

    async createFabric(fabric: Partial<FabricItem>): Promise<FabricItem> {
      if (isRealElectron && existing?.createFabric) return existing.createFabric(fabric);
      let newFabric!: FabricItem;
      await db.transaction((draft) => {
        newFabric = createFabricInDraft(draft, fabric);
      });
      return newFabric;
    },

    async updateFabric(fabric: FabricItem): Promise<boolean> {
      if (isRealElectron && existing?.updateFabric) return existing.updateFabric(fabric);
      await db.transaction((draft) => {
        updateFabricInDraft(draft, fabric);
      });
      return true;
    },

    async getAccessories(): Promise<AccessoryItem[]> {
      if (isRealElectron && existing?.getAccessories) return existing.getAccessories();
      const data = await window.electronAPI.getData();
      return data.accessories;
    },

    async createAccessory(acc: Partial<AccessoryItem>): Promise<AccessoryItem> {
      if (isRealElectron && existing?.createAccessory) return existing.createAccessory(acc);
      let newAccessory!: AccessoryItem;
      await db.transaction((draft) => {
        newAccessory = createAccessoryInDraft(draft, acc);
      });
      return newAccessory;
    },

    async updateAccessory(acc: AccessoryItem): Promise<boolean> {
      if (isRealElectron && existing?.updateAccessory) return existing.updateAccessory(acc);
      await db.transaction((draft) => {
        updateAccessoryInDraft(draft, acc);
      });
      return true;
    },

    async getThobeTypes(): Promise<ThobeType[]> {
      if (isRealElectron && existing?.getThobeTypes) return existing.getThobeTypes();
      const data = await window.electronAPI.getData();
      return data.thobeTypes || INITIAL_THOBE_TYPES;
    },

    async createThobeType(type: Partial<ThobeType>): Promise<ThobeType> {
      if (isRealElectron && existing?.createThobeType) return existing.createThobeType(type);
      let created!: ThobeType;
      await db.transaction((draft) => {
        created = { id: type.id || createSafeId('THB'), name: type.name || '', defaultPrice: Number(type.defaultPrice || 0), description: type.description || '' };
        draft.thobeTypes = [created, ...(draft.thobeTypes || []).filter((item) => item.id !== created.id)];
      });
      return created;
    },

    async updateThobeType(type: ThobeType): Promise<boolean> {
      if (isRealElectron && existing?.updateThobeType) return existing.updateThobeType(type);
      await db.transaction((draft) => {
        draft.thobeTypes = (draft.thobeTypes || []).map((item) => (item.id === type.id ? type : item));
      });
      return true;
    },

    async deleteThobeType(id: string): Promise<boolean> {
      if (isRealElectron && existing?.deleteThobeType) return existing.deleteThobeType(id);
      await db.transaction((draft) => {
        draft.thobeTypes = (draft.thobeTypes || []).filter((item) => item.id !== id);
      });
      return true;
    },

    async getColors(): Promise<ColorItem[]> {
      if (isRealElectron && existing?.getColors) return existing.getColors();
      const data = await window.electronAPI.getData();
      return data.colors || INITIAL_COLORS;
    },

    async createColor(color: Partial<ColorItem>): Promise<ColorItem> {
      if (isRealElectron && existing?.createColor) return existing.createColor(color);
      let created!: ColorItem;
      await db.transaction((draft) => {
        created = { id: color.id || createSafeId('COL'), name: color.name || '', hex: color.hex || '#ffffff' };
        draft.colors = [created, ...(draft.colors || []).filter((item) => item.id !== created.id)];
      });
      return created;
    },

    async updateColor(color: ColorItem): Promise<boolean> {
      if (isRealElectron && existing?.updateColor) return existing.updateColor(color);
      await db.transaction((draft) => {
        draft.colors = (draft.colors || []).map((item) => (item.id === color.id ? color : item));
      });
      return true;
    },

    async deleteColor(id: string): Promise<boolean> {
      if (isRealElectron && existing?.deleteColor) return existing.deleteColor(id);
      await db.transaction((draft) => {
        draft.colors = (draft.colors || []).filter((item) => item.id !== id);
      });
      return true;
    },

    async getStockMovements(itemType?: InventoryItemType, itemId?: string): Promise<StockMovement[]> {
      if (isRealElectron && existing?.getStockMovements) return existing.getStockMovements(itemType, itemId);
      const data = await window.electronAPI.getData();
      return (data.stockMovements || []).filter((movement) => (!itemType || movement.itemType === itemType) && (!itemId || movement.itemId === itemId));
    },

    async adjustStock(request: AdjustStockRequest): Promise<StockMovement> {
      if (isRealElectron && existing?.adjustStock) return existing.adjustStock(request);
      const { itemType, itemId, quantity, reason, direction, actorId = 'system', unitCost } = request;
      let movement!: StockMovement;
      await db.transaction((draft) => {
        if (!reason?.trim()) throw new Error('سبب التسوية مطلوب');
        const numericQuantity = Number(quantity);
        if (!Number.isFinite(numericQuantity) || numericQuantity === 0) throw new Error('كمية التسوية يجب أن تكون رقماً غير صفري');
        if (direction !== 'adjustment' && numericQuantity < 0) throw new Error('كمية الحركة لا يمكن أن تكون سالبة');
        const delta = direction === 'return' || direction === 'adjustment_in'
          ? Math.abs(numericQuantity)
          : direction === 'adjustment_out' ? -Math.abs(numericQuantity) : numericQuantity;
        movement = insertStockMovementInDraft(draft, itemType, itemId, delta, direction === 'return' ? 'return' : 'adjustment', reason.trim(), { type: 'stock_adjustment', id: itemId }, { actorId, unitCost, updateWac: direction === 'adjustment_in' });
      });
      return movement;
    },

    async returnPurchase(request: ReturnPurchaseRequest): Promise<StockMovement> {
      if (isRealElectron && existing?.returnPurchase) return existing.returnPurchase(request);
      const { itemType, itemId, quantity, reason, originalMovementId, purchaseId, actorId = 'system' } = request;
      let movement!: StockMovement;
      await db.transaction((draft) => {
        movement = returnPurchaseInDraft(draft, itemType, itemId, quantity, reason, originalMovementId, purchaseId, actorId);
      });
      return movement;
    },

    async getPurchases(): Promise<PurchaseRecord[]> {
      if (isRealElectron && existing?.getPurchases) return existing.getPurchases();
      const data = await window.electronAPI.getData();
      return data.purchases || [];
    },

    async createPurchase(payload: any): Promise<PurchaseRecord> {
      if (isRealElectron && existing?.createPurchase) return existing.createPurchase(payload);
      let purchase!: PurchaseRecord;
      await db.transaction((draft) => {
        purchase = createPurchaseInDraft(draft, payload);
      });
      return purchase;
    },

    async getExpenses(): Promise<ExpenseRecord[]> {
      if (isRealElectron && existing?.getExpenses) return existing.getExpenses();
      const data = await window.electronAPI.getData();
      return data.expenses || [];
    },

    async createExpense(payload: any): Promise<ExpenseRecord> {
      if (isRealElectron && existing?.createExpense) return existing.createExpense(payload);
      let expense!: ExpenseRecord;
      await db.transaction((draft) => {
        expense = applyExpenseToDraft(draft, payload);
      });
      return expense;
    },

    async getCashTransactions(): Promise<CashTransaction[]> {
      if (isRealElectron && existing?.getCashTransactions) return existing.getCashTransactions();
      const data = await window.electronAPI.getData();
      return data.cashTransactions || [];
    },

    async createCashAdjustment(payload: any): Promise<CashTransaction> {
      if (isRealElectron && existing?.createCashAdjustment) return existing.createCashAdjustment(payload);
      let transaction!: CashTransaction;
      await db.transaction((draft) => {
        transaction = applyCashAdjustmentToDraft(draft, payload);
      });
      return transaction;
    },

    async getOrderMaterialUsages(orderId?: string): Promise<OrderMaterialUsage[]> {
      if (isRealElectron && existing?.getOrderMaterialUsages) return existing.getOrderMaterialUsages(orderId);
      const data = await window.electronAPI.getData();
      return (data.orderMaterialUsages || []).filter((usage) => !orderId || usage.orderId === orderId);
    },

    async getOrderEvents(orderId?: string): Promise<OrderEvent[]> {
      if (isRealElectron && existing?.getOrderEvents) return existing.getOrderEvents(orderId);
      const data = await window.electronAPI.getData();
      return (data.orderEvents || []).filter((event) => !orderId || event.orderId === orderId);
    },

    async getOrders(query?: { page?: number; limit?: number }) {
      if (isRealElectron && existing?.getOrders) return existing.getOrders(query);
      const data = await window.electronAPI.getData();
      return paginateOrders(data.orders, query);
    },

    async getDashboardSummary() {
      if (isRealElectron && existing?.getDashboardSummary) return existing.getDashboardSummary();
      const data = await window.electronAPI.getData();
      const lowFabrics = (data.fabrics || []).filter((item) => item.quantityMeters <= item.minStockMeters).length;
      const lowAccessories = (data.accessories || []).filter((item) => item.quantity <= item.minStock).length;
      return {
        totalOrders: data.orders.length,
        revenue: data.invoices.reduce((sum, invoice) => sum + (invoice.paidAmount || 0), 0),
        lowStockCount: lowFabrics + lowAccessories,
        unreadNotifications: (data.notifications || []).filter((item) => !item.read && !item.archivedAt).length,
        newCount: data.orders.filter((order) => order.status === 'new').length,
        processingCount: data.orders.filter((order) => order.status === 'processing').length,
        readyCount: data.orders.filter((order) => order.status === 'ready').length,
        deliveredCount: data.orders.filter((order) => order.status === 'delivered').length,
        cancelledCount: data.orders.filter((order) => order.status === 'cancelled').length,
      };
    },

    async createOrder(orderData: Partial<Order>): Promise<Order> {
      if (isRealElectron && existing?.createOrder) return existing.createOrder(orderData);
      const existingData = await window.electronAPI.getData();
      const existingOrder = existingData.orders.find((order) => order.id === orderData.id || (orderData.orderNumber && order.orderNumber === orderData.orderNumber));
      if (existingOrder) return existingOrder;
      let createdOrder: Order | null = null;
      await db.transaction(async (draft) => {
        const settings = await window.electronAPI.getSettings();
        const rate = settings.fabricConsumptionRatePerGarment || 3.5;
        const garmentCount = orderData.garmentCount || 1;
        const requiredMeters = garmentCount * rate;
        const orderNumber = orderData.orderNumber || nextMockOrderNumber(draft.orders);
        const initialStatus = assertSafeInitialOrderStatus(orderData.status);
        const initialPaymentMethod = assertValidPaymentMethod((orderData as any).initialPaymentMethod || 'cash');
        const initialCashReceived = Number(orderData.paidAmount || 0);
        const settlement = initialCashReceived > 0
          ? calculatePaymentUpdate(orderData.totalAmount || 0, 0, orderData.totalAmount || 0, initialCashReceived)
          : { numericAmount: 0, cashReceived: 0, overpaymentAmount: 0, ...calculateOrderAmounts(orderData.totalAmount || 0, 0) };
        if (settlement.overpaymentAmount > 0 && !orderData.customerId) throw new Error('لا يمكن تسجيل overpayment دون ربط الطلب بعميل');
        const { totalAmount, paidAmount, remainingAmount, cashReceived, overpaymentAmount } = settlement;
        const orderId = orderData.id || createSafeId('ORD');
        let fabricMovement: StockMovement | undefined;
        let fabricBuyPrice = orderData.fabricBuyPriceAtOrder || 0;

        // Check stock and record a sale movement atomically.
        if (orderData.fabricId) {
          const fab = draft.fabrics.find(f => f.id === orderData.fabricId);
          if (!fab) throw new Error('القماش المختار غير موجود في المخزون');
          fabricBuyPrice = fab.purchasePrice || fabricBuyPrice;
          fabricMovement = insertStockMovementInDraft(draft, 'fabric', orderData.fabricId, -requiredMeters, 'sale', 'استهلاك قماش للطلب', { type: 'order', id: orderId, number: orderNumber });
        }

        const materialUsages: OrderMaterialUsage[] = [];
        if (orderData.fabricId && fabricMovement) {
          const fabricUsage = buildFabricMaterialUsage(orderId, orderData.fabricId, orderData.fabricName || 'قماش', requiredMeters, fabricBuyPrice, fabricMovement, new Date().toISOString());
          appendMaterialUsage(draft, fabricUsage);
          materialUsages.push(fabricUsage);
        }
        for (const material of (orderData.materialUsages || [])) {
          if (!material.itemId || (material.itemType === 'fabric' && material.itemId === orderData.fabricId)) continue;
          const quantity = Number(material.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('كمية المادة المرتبطة بالطلب غير صحيحة');
          const meta = getInventoryMeta(draft, material.itemType, material.itemId);
          const movement = insertStockMovementInDraft(draft, material.itemType, material.itemId, -quantity, 'sale', 'استهلاك مادة للطلب', { type: 'order', id: orderId, number: orderNumber });
          const usage = buildMaterialUsage(orderId, material, meta, movement, new Date().toISOString());
          appendMaterialUsage(draft, usage);
          materialUsages.push(usage);
        }
        const materialCost = calculateOrderMaterialCost(materialUsages);

        const createdAt = new Date().toISOString();
        const newOrder = buildOrderDraft({ ...orderData, status: initialStatus, initialPaymentMethod }, {
          orderId,
          orderNumber,
          requiredMeters,
          fabricBuyPrice,
          garmentCount,
          totalAmount,
          paidAmount,
          cashReceived,
          overpaymentAmount,
          materialUsages,
          materialCost,
          createdAt
        });

        draft.orders = [newOrder, ...draft.orders];

        // Create invoice and initial payment through the isolated order adapter.
        const visibleInvoiceNumber = nextMockInvoiceNumber(draft.invoices);
        const { invoice: newInvoice, payment: initialPayment } = buildInitialInvoiceDraft({ ...orderData, status: initialStatus, initialPaymentMethod }, orderId, orderNumber, totalAmount, cashReceived, visibleInvoiceNumber);
        const initialPaymentId = initialPayment?.id;

        draft.invoices = [newInvoice, ...draft.invoices];
        if (initialPaymentId) {
          mockInsertCash(draft, { id: `CASH-PAY-${initialPaymentId}`, direction: 'in', sourceType: 'customer_payment', sourceId: initialPaymentId, orderId, referenceNumber: orderNumber, amount: cashReceived, paymentMethod: orderData.initialPaymentMethod || 'cash', transactionDate: orderData.orderDate || new Date().toISOString().slice(0, 10), description: `دفعة أولى للطلب #${orderNumber}`, actorId: 'system', reason: 'دفعة أولى عند إنشاء الطلب', createdAt: new Date().toISOString() });
          if (overpaymentAmount > 0) {
            createCustomerCreditFromOverpaymentInDraft(draft, {
              customerId: orderData.customerId,
              orderId,
              invoiceId: newInvoice.id,
              paymentId: initialPaymentId,
              amount: overpaymentAmount,
              paymentMethod: orderData.initialPaymentMethod || 'cash',
              invoiceNumber: newInvoice.invoiceNumber,
              createdAt: new Date().toISOString()
            });
          }
        }
        mockInsertEvent(draft, {
          id: `EVT-CREATED-${orderId}`,
          orderId,
          type: 'created',
          title: 'تم إنشاء الطلب',
          description: `تم إنشاء الطلب #${orderNumber} وتسجيل الفاتورة${paidAmount > 0 ? ' والدفعة الأولى' : ''}.`,
          toStatus: newOrder.status,
          actor: 'النظام',
          metadata: { materialCost, appliedPaid: paidAmount, cashReceived, overpaymentAmount, remainingAmount, paymentStatus: newInvoice.paymentStatus },
          createdAt: newOrder.createdAt
        });
        createdOrder = newOrder;
      });
      return createdOrder!;
    },

    async updateOrder(updatedOrder: Order): Promise<boolean> {
      if (isRealElectron && existing?.updateOrder) return existing.updateOrder(updatedOrder);
      await db.transaction(async (draft) => {
        const existingOrder = draft.orders.find(o => o.id === updatedOrder.id);
        if (!existingOrder) throw new Error('الطلب المطلوب غير موجود');
        const invoice = draft.invoices.find((item) => item.orderId === updatedOrder.id);
        if (!invoice) throw new Error('لا توجد فاتورة مرتبطة بالطلب');
        const current = assertStoredPaymentAggregates(invoice.totalAmount, invoice.paidAmount, invoice.remainingAmount, invoice.payments || [], invoice.cancellationWriteoffAmount);
        if (Math.abs(Number(updatedOrder.paidAmount ?? current.paidAmount) - current.paidAmount) > 0.0001) throw new Error('لا يمكن تعديل المبلغ المدفوع من خلال تحديث الطلب؛ استخدم مسار الدفعات');

        const settings = await window.electronAPI.getSettings();
        const rate = settings.fabricConsumptionRatePerGarment || 3.5;
        const garmentCount = Number(updatedOrder.garmentCount ?? existingOrder.garmentCount ?? 1);
        if (!Number.isInteger(garmentCount) || garmentCount < 1) throw new Error('عدد الثياب يجب أن يكون عدداً صحيحاً لا يقل عن 1');
        const newMeters = garmentCount * rate;

        updateOrderMaterialsInDraft(draft, existingOrder, updatedOrder, newMeters);

        updatedOrder.fabricConsumptionMeters = newMeters;
        updatedOrder.garmentCount = garmentCount;
        const totalAmount = Number(updatedOrder.totalAmount ?? existingOrder.totalAmount);
        const paidAmount = current.paidAmount;
        updateOrderInvoiceInDraft(draft, updatedOrder, totalAmount, paidAmount);
        const updatedInvoice = draft.invoices.find((item) => item.orderId === updatedOrder.id);

        draft.orders = draft.orders.map((order) => order.id === updatedOrder.id ? {
          ...updatedOrder,
          status: existingOrder.status,
          paidAmount,
          remainingAmount: updatedInvoice?.remainingAmount ?? current.remainingAmount,
          cashReceived: updatedInvoice?.cashReceived ?? existingOrder.cashReceived,
          overpaymentAmount: updatedInvoice?.overpaymentAmount ?? existingOrder.overpaymentAmount,
          cancellationWriteoffAmount: updatedInvoice?.cancellationWriteoffAmount ?? existingOrder.cancellationWriteoffAmount
        } : order);
      });
      return true;
    },

    async updateOrderStatus(request: UpdateOrderStatusRequest): Promise<boolean> {
      if (isRealElectron && existing?.updateOrderStatus) return existing.updateOrderStatus(request);
      const { orderId: id, status } = request;
      await db.transaction((draft) => {
        const order = draft.orders.find((item) => item.id === id);
        if (!order) throw new Error('الطلب غير موجود في قاعدة البيانات');
        const oldStatus = String(order.status);
        if (oldStatus === status) return;
        if (!ALLOWED_ORDER_STATUS_TRANSITIONS[oldStatus as keyof typeof ALLOWED_ORDER_STATUS_TRANSITIONS]?.includes(status)) throw new Error(`انتقال حالة الطلب من ${oldStatus} إلى ${status} غير مسموح`);
        const usages = (draft.orderMaterialUsages || []).filter((usage) => usage.orderId === id);
        let cancellationWriteoffAmount = 0;
        let cancellationPaymentStatus: 'paid' | 'settled_by_cancellation' | undefined;
        if (status === 'cancelled') {
          const settlement = settleCancelledOrderInDraft(draft, id);
          cancellationWriteoffAmount = settlement.cancellationWriteoffAmount;
          cancellationPaymentStatus = settlement.paymentStatus;
          for (const usage of usages) {
            const movement = insertStockMovementInDraft(draft, usage.itemType, usage.itemId, usage.quantity, 'return', 'إرجاع مواد بسبب إلغاء الطلب', { type: 'order_cancel', id }, { unitCost: usage.unitCostAtUsage, sourceMovementId: usage.sourceMovementId, actorId: 'system', updateWac: false });
            usage.sourceMovementId = undefined;
            void movement;
          }
        } else if (oldStatus === 'cancelled' && status === 'new') {
          for (const usage of usages) {
            const movement = insertStockMovementInDraft(draft, usage.itemType, usage.itemId, -usage.quantity, 'sale', 'إعادة استهلاك مواد بعد إلغاء الإلغاء', { type: 'order_reactivate', id });
            usage.sourceMovementId = movement.id;
          }
        }
        order.status = status as any;
        const createdAt = new Date().toISOString();
        mockInsertEvent(draft, {
          id: createSafeId(`EVT-STATUS-${id}`),
          orderId: id,
          type: 'status_changed',
          title: `تغيير الحالة إلى ${status}`,
          description: `تم تغيير حالة الطلب من ${oldStatus} إلى ${status}${status === 'cancelled' ? ' مع إعادة المواد للمخزون' : oldStatus === 'cancelled' ? ' مع إعادة استهلاك المواد' : ''}.`,
          fromStatus: oldStatus,
          toStatus: status,
          actor: 'النظام',
          metadata: status === 'cancelled' ? { cancellationWriteoffAmount, paymentStatus: cancellationPaymentStatus || 'paid', cashReversalCreated: false } : undefined,
          createdAt
        });
      });
      return true;
    },

    async getInvoices(): Promise<Invoice[]> {
      if (isRealElectron && existing?.getInvoices) return existing.getInvoices();
      const data = await window.electronAPI.getData();
      return data.invoices;
    },

    async addPayment(request: AddPaymentRequest): Promise<boolean> {
      if (isRealElectron && existing?.addPayment) return existing.addPayment(request);
      await db.transaction((draft) => {
        applyPaymentToDraft(draft, request.invoiceId, request.amount, request.method, request.note, request.paymentId);
      });
      return true;
    },

    customerCredits: {
      async list(customerId: string, filters: CustomerCreditHistoryFilters = {}): Promise<CustomerCreditRecord[]> {
        if (isRealElectron && existing?.customerCredits?.list) return existing.customerCredits.list(customerId, filters);
        const data = await window.electronAPI.getData();
        return getCustomerCreditHistoryInDraft(data, customerId, filters);
      },
      async summary(customerId: string): Promise<CustomerCreditSummary> {
        if (isRealElectron && existing?.customerCredits?.summary) return existing.customerCredits.summary(customerId);
        const data = await window.electronAPI.getData();
        return getCustomerCreditSummaryInDraft(data, customerId);
      },
      async apply(request: CustomerCreditApplyRequest): Promise<CustomerCreditOperationResult> {
        if (isRealElectron && existing?.customerCredits?.apply) return existing.customerCredits.apply(request);
        const transaction = await db.transaction((draft) => applyCustomerCreditInDraft(draft, request));
        return transaction.result;
      },
      async refund(request: CustomerCreditRefundRequest): Promise<CustomerCreditOperationResult> {
        if (isRealElectron && existing?.customerCredits?.refund) return existing.customerCredits.refund(request);
        const transaction = await db.transaction((draft) => refundCustomerCreditInDraft(draft, request));
        return transaction.result;
      },
      async getOperation(operationId: string) {
        if (isRealElectron && existing?.customerCredits?.getOperation) return existing.customerCredits.getOperation(operationId);
        const data = await window.electronAPI.getData();
        return getCustomerCreditOperationInDraft(data, operationId);
      }
    },

    notifications: {
      async list(includeArchived = false): Promise<NotificationItem[]> {
        if (isRealElectron && existing?.notifications?.list) return existing.notifications.list(includeArchived);
        const data = await window.electronAPI.getData();
        return (data.notifications || []).filter((item) => includeArchived || !item.archivedAt);
      },
      async markRead(id: string): Promise<NotificationItem | undefined> {
        if (isRealElectron && existing?.notifications?.markRead) return existing.notifications.markRead(id);
        let result: NotificationItem | undefined;
        await db.transaction((draft) => {
          const item = draft.notifications.find((notification) => notification.id === id);
          if (!item) return;
          const now = new Date().toISOString();
          item.read = true;
          item.readAt = now;
          item.updatedAt = now;
          result = item;
        });
        return result;
      },
      async markAllRead(): Promise<{ updated: number }> {
        if (isRealElectron && existing?.notifications?.markAllRead) return existing.notifications.markAllRead();
        let updated = 0;
        await db.transaction((draft) => {
          const now = new Date().toISOString();
          for (const item of draft.notifications) {
            if (!item.archivedAt && !item.read) {
              item.read = true;
              item.readAt = now;
              item.updatedAt = now;
              updated++;
            }
          }
        });
        return { updated };
      },
      async clearAll(): Promise<{ archived: number }> {
        if (isRealElectron && existing?.notifications?.clearAll) return existing.notifications.clearAll();
        let archived = 0;
        await db.transaction((draft) => {
          const now = new Date().toISOString();
          for (const item of draft.notifications) {
            if (!item.archivedAt) {
              item.archivedAt = now;
              item.updatedAt = now;
              archived++;
            }
          }
        });
        return { archived };
      },
      async retry(id: string): Promise<NotificationItem> {
        if (isRealElectron && existing?.notifications?.retry) return existing.notifications.retry(id);
        let result!: NotificationItem;
        await db.transaction((draft) => {
          const item = draft.notifications.find((notification) => notification.id === id);
          if (!item) throw new Error('الإشعار غير موجود');
          const retryCount = Number(item.retryCount || 0);
          if (retryCount >= MAX_NOTIFICATION_RETRIES) throw new Error('تم تجاوز الحد الأقصى لمحاولات إعادة الإرسال');
          const now = new Date().toISOString();
          item.retryCount = retryCount + 1;
          item.status = 'retry';
          item.lastError = undefined;
          item.updatedAt = now;
          item.retryHistory = [...(item.retryHistory || []), { attempt: item.retryCount, status: 'retry', occurredAt: now }];
          result = item;
        });
        return result;
      }
    },

    async getSettings(): Promise<any> {
      if (isRealElectron && existing?.getSettings) return existing.getSettings();
      try {
        const stored = localStorage.getItem('sahwa_settings_v1');
        if (stored) return JSON.parse(stored);
      } catch (e) {}
      return { fabricConsumptionRatePerGarment: 3.5 };
    },

    async exportExcelReport(_startDate?: string, _endDate?: string): Promise<string> {
      if (isRealElectron && existing?.exportExcelReport) return existing.exportExcelReport(_startDate, _endDate);
      throw new Error('تصدير Excel متاح في نسخة سطح المكتب فقط');
    },

    async updateSetting(request: SettingsUpdateRequest): Promise<boolean> {
      if (isRealElectron && existing?.updateSetting) return existing.updateSetting(request);
      try {
        const settings = await window.electronAPI.getSettings();
        settings[request.key] = request.value;
        localStorage.setItem('sahwa_settings_v1', JSON.stringify(settings));
        return true;
      } catch (e) {
        return false;
      }
    },

    async sendWhatsAppNotice(request: WhatsAppSendRequest): Promise<boolean> {
      const { phone, customerName, orderNumber, statusText } = request;
      const cleanPhone = phone.replace(/\D/g, '');
      const internationalPhone = cleanPhone.startsWith('05') ? '966' + cleanPhone.substring(1) : cleanPhone;
      const message = `مرحباً بك أ/ ${customerName}، نفيدك بنتيجة متابعة طلبك رقم (#${orderNumber}) لدى صهوة للخياطة. حالياً: ${statusText}. يسعدنا تواصلكم دائماً!`;
      const sourceId = notificationSourceId(phone, orderNumber, statusText);
      const before = await window.electronAPI.getData();
      const order = before.orders.find((item) => item.orderNumber === orderNumber);
      let notificationId = '';
      await db.transaction((draft) => {
        const item = upsertNotificationInDraft(draft, {
          id: createSafeId('NOTIF'),
          type: 'whatsapp',
          title: `إرسال واتساب قيد التنفيذ - طلب #${orderNumber}`,
          message: `جاري تجهيز رسالة واتساب للعميل ${customerName} (${phone}) - الحالة: ${statusText}`,
          date: new Date().toLocaleString('ar-SA'),
          read: false,
          customerPhone: phone,
          orderId: order?.id,
          status: 'pending',
          source: 'whatsapp',
          sourceId,
          retryCount: 0,
          retryHistory: []
        });
        notificationId = item.id;
      });

      let sent = false;
      let failure: string | undefined;
      try {
        if ((globalThis as any).SAHWA_FORCE_WHATSAPP_FAILURE === '1') throw new Error('forced failure');
        if (typeof window.open !== 'function') throw new Error('تعذر فتح نافذة واتساب');
        const opened = window.open(`https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`, '_blank');
        if (!opened) throw new Error('تعذر فتح نافذة واتساب');
        sent = true;
      } catch (error: any) {
        failure = error?.message || String(error);
      }

      await db.transaction((draft) => {
        const item = draft.notifications.find((notification) => notification.id === notificationId);
        if (!item) return;
        const now = new Date().toISOString();
        item.status = sent ? 'sent' : 'failed';
        item.read = false;
        item.lastError = sent ? undefined : failure;
        item.retryHistory = [...(item.retryHistory || []), { attempt: Number(item.retryCount || 0), status: item.status, error: failure, occurredAt: now }];
        item.updatedAt = now;
        if (sent && order) {
          mockInsertEvent(draft, {
            id: `EVT-WHATSAPP-${item.id}-sent`,
            orderId: order.id,
            type: 'whatsapp',
            title: 'فتح رسالة واتساب',
            description: `تم تجهيز رسالة واتساب للعميل ${customerName} عن حالة الطلب: ${statusText}.`,
            actor: 'النظام',
            metadata: { phone, orderNumber, statusText, result: 'sent' },
            createdAt: now
          });
        }
      });
      return sent;
    },

    printDocument() {
      window.print();
    }
  } as any;
}
