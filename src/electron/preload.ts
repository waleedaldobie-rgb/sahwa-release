import { contextBridge, ipcRenderer } from 'electron';
import {
  Customer,
  Order,
  FabricItem,
  AccessoryItem,
  ThobeType,
  ColorItem,
  InventoryItemType,
  CustomerCreditApplyRequest,
  CustomerCreditHistoryFilters,
  CustomerCreditRefundRequest,
  AddPaymentRequest,
  AdjustStockRequest,
  ReturnPurchaseRequest,
  UpdateOrderStatusRequest,
  WhatsAppSendRequest,
  SettingsUpdateRequest
} from '../types';

export const electronBridge = {
  // Compatibility data facade used by the existing React state layer.
  getData: () => ipcRenderer.invoke('data:get'),
  saveData: (data: unknown) => ipcRenderer.invoke('data:save', data),
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  savePreferences: (preferences: Record<string, unknown>) => ipcRenderer.invoke('preferences:save', preferences),

  // Customers
  getCustomers: () => ipcRenderer.invoke('customers:list'),
  createCustomer: (customer: Partial<Customer>) => ipcRenderer.invoke('customers:create', customer),
  updateCustomer: (customer: Customer) => ipcRenderer.invoke('customers:update', customer),
  deleteCustomer: (id: string) => ipcRenderer.invoke('customers:delete', id),
  saveCustomerMeasurementHistory: (id: string, note: string) => ipcRenderer.invoke('customers:saveMeasurementHistory', id, note),

  // Fabrics & Accessories
  getFabrics: () => ipcRenderer.invoke('fabrics:list'),
  createFabric: (fabric: Partial<FabricItem>) => ipcRenderer.invoke('fabrics:create', fabric),
  updateFabric: (fabric: FabricItem) => ipcRenderer.invoke('fabrics:update', fabric),
  deleteFabric: (id: string) => ipcRenderer.invoke('fabrics:delete', id),

  getAccessories: () => ipcRenderer.invoke('accessories:list'),
  createAccessory: (acc: Partial<AccessoryItem>) => ipcRenderer.invoke('accessories:create', acc),
  updateAccessory: (acc: AccessoryItem) => ipcRenderer.invoke('accessories:update', acc),
  deleteAccessory: (id: string) => ipcRenderer.invoke('accessories:delete', id),

  // Thobe Types & Colors
  getThobeTypes: () => ipcRenderer.invoke('thobeTypes:list'),
  createThobeType: (type: Partial<ThobeType>) => ipcRenderer.invoke('thobeTypes:create', type),
  updateThobeType: (type: ThobeType) => ipcRenderer.invoke('thobeTypes:update', type),
  deleteThobeType: (id: string) => ipcRenderer.invoke('thobeTypes:delete', id),
  getColors: () => ipcRenderer.invoke('colors:list'),
  createColor: (color: Partial<ColorItem>) => ipcRenderer.invoke('colors:create', color),
  updateColor: (color: ColorItem) => ipcRenderer.invoke('colors:update', color),
  deleteColor: (id: string) => ipcRenderer.invoke('colors:delete', id),

  // Orders
  getOrders: (query?: { page?: number; limit?: number }) => ipcRenderer.invoke('orders:list', query),
  getDashboardSummary: () => ipcRenderer.invoke('dashboard:getSummary'),
  createOrder: (order: Partial<Order>) => ipcRenderer.invoke('orders:create', order),
  updateOrder: (order: Order) => ipcRenderer.invoke('orders:update', order),
  deleteOrder: (id: string) => ipcRenderer.invoke('orders:delete', id),
  updateOrderStatus: (request: UpdateOrderStatusRequest) => ipcRenderer.invoke('orders:updateStatus', request),
  getOrderEvents: (orderId?: string) => ipcRenderer.invoke('orders:events:list', orderId),

  // Invoices & Payments
  getInvoices: () => ipcRenderer.invoke('invoices:list'),
  addPayment: (request: AddPaymentRequest) => ipcRenderer.invoke('invoices:addPayment', request),

  customerCredits: {
    list: (customerId: string, filters?: CustomerCreditHistoryFilters) => ipcRenderer.invoke('customerCredits:list', customerId, filters),
    summary: (customerId: string) => ipcRenderer.invoke('customerCredits:summary', customerId),
    diagnostics: () => ipcRenderer.invoke('customerCredits:diagnostics'),
    apply: (request: CustomerCreditApplyRequest) => ipcRenderer.invoke('customerCredits:apply', request),
    refund: (request: CustomerCreditRefundRequest) => ipcRenderer.invoke('customerCredits:refund', request),
    getOperation: (operationId: string) => ipcRenderer.invoke('customerCredits:getOperation', operationId)
  },

  // Inventory movements, purchases, expenses & cash ledger
  notifications: {
    list: (includeArchived = false) => ipcRenderer.invoke('notifications:list', includeArchived),
    markRead: (id: string) => ipcRenderer.invoke('notifications:markRead', id),
    markAllRead: () => ipcRenderer.invoke('notifications:markAllRead'),
    clearAll: () => ipcRenderer.invoke('notifications:clearAll'),
    retry: (id: string) => ipcRenderer.invoke('notifications:retry', id)
  },
  getStockMovements: (itemType?: InventoryItemType, itemId?: string) => ipcRenderer.invoke('stockMovements:list', itemType, itemId),
  adjustStock: (request: AdjustStockRequest) => ipcRenderer.invoke('stock:adjust', request),
  returnPurchase: (request: ReturnPurchaseRequest) => ipcRenderer.invoke('stock:returnPurchase', request),
  getPurchases: () => ipcRenderer.invoke('purchases:list'),
  createPurchase: (purchase: unknown) => ipcRenderer.invoke('purchases:create', purchase),
  getExpenses: () => ipcRenderer.invoke('expenses:list'),
  createExpense: (expense: unknown) => ipcRenderer.invoke('expenses:create', expense),
  getCashTransactions: () => ipcRenderer.invoke('cash:list'),
  createCashAdjustment: (transaction: unknown) => ipcRenderer.invoke('cash:createAdjustment', transaction),
  getOrderMaterialUsages: (orderId?: string) => ipcRenderer.invoke('orderMaterials:list', orderId),

  // System & Excel Reports
  exportBackup: () => ipcRenderer.invoke('system:backup'),
  importBackup: (jsonContent: string) => ipcRenderer.invoke('system:restore', jsonContent),
  clearAllData: () => ipcRenderer.invoke('system:clearAllData'),
  checkDatabaseIntegrity: () => ipcRenderer.invoke('system:integrityCheck'),
  exportExcelReport: (startDate?: string, endDate?: string) => ipcRenderer.invoke('reports:exportExcel', startDate, endDate),
  automationStorageInfo: () => ipcRenderer.invoke('automation:storageInfo'),
  automationPrintToPDF: (options?: Record<string, unknown>) => ipcRenderer.invoke('automation:printToPDF', options),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSetting: (request: SettingsUpdateRequest) => ipcRenderer.invoke('settings:update', request),

  sendWhatsAppNotice: (request: WhatsAppSendRequest) => ipcRenderer.invoke('whatsapp:send', request),

  printDocument: () => window.print()
};

contextBridge.exposeInMainWorld('electronAPI', electronBridge);
