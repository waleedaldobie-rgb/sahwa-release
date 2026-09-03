import { Order } from '../types';
import { OrderResult, SahwaGateway } from './gateway';

type ElectronApi = Window['electronAPI'];

function asOrderResult(created: Order | OrderResult): OrderResult {
  if (typeof created === 'object' && created && 'orderId' in created && created.orderId) {
    return {
      orderId: String(created.orderId),
      orderNumber: created.orderNumber,
      remainingAmount: Number(created.remainingAmount || 0),
      materialUsages: created.materialUsages || [],
      materialCost: Number(created.materialCost || 0),
      profit: Number(created.profit || 0),
      alreadyExists: created.alreadyExists,
    };
  }
  const order = created as Order;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    remainingAmount: Number(order.remainingAmount || 0),
    materialUsages: order.materialUsages || [],
    materialCost: Number(order.materialCost || 0),
    profit: Number(order.profit || 0),
  };
}

async function listOrdersFromApi(api: ElectronApi): Promise<unknown[]> {
  const result = await api.getOrders?.();
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as { items?: unknown[] }).items)) {
    return (result as { items: unknown[] }).items;
  }
  return [];
}

export function createElectronGateway(api: ElectronApi): SahwaGateway {
  return {
    getData: () => api.getData(),
    saveData: (data) => api.saveData(data as never),

    listCustomers: () => api.getCustomers ? api.getCustomers() : Promise.resolve([]),
    createCustomer: (input) => api.createCustomer!(input as never),
    updateCustomer: (input) => api.updateCustomer!(input as never),
    deleteCustomer: (id) => api.deleteCustomer!(id),
    saveMeasurementHistory: (id, note) => api.saveCustomerMeasurementHistory!(id, note),

    listOrders: () => listOrdersFromApi(api),
    createOrder: async (input, rate) => {
      const created = await api.createOrder!({ ...(input as object), fabricConsumptionRate: rate } as never);
      return asOrderResult(created as never);
    },
    updateOrder: (input, rate) => api.updateOrder!({ ...(input as object), fabricConsumptionRate: rate } as never),
    deleteOrder: (id) => api.deleteOrder!(id),
    updateOrderStatus: (input) => api.updateOrderStatus!(input as never),
    addPayment: (input) => api.addPayment!(input as never),
    listInvoices: () => api.getInvoices ? api.getInvoices() : Promise.resolve([]),

    listFabrics: () => api.getFabrics ? api.getFabrics() : Promise.resolve([]),
    createFabric: (input) => api.createFabric!(input as never),
    updateFabric: (input) => api.updateFabric!(input as never),
    deleteFabric: (id) => api.deleteFabric!(id),
    listAccessories: () => api.getAccessories ? api.getAccessories() : Promise.resolve([]),
    createAccessory: (input) => api.createAccessory!(input as never),
    updateAccessory: (input) => api.updateAccessory!(input as never),
    deleteAccessory: (id) => api.deleteAccessory!(id),
    listThobeTypes: () => api.getThobeTypes ? api.getThobeTypes() : Promise.resolve([]),
    createThobeType: (input) => api.createThobeType!(input as never),
    updateThobeType: (input) => api.updateThobeType!(input as never),
    deleteThobeType: (id) => api.deleteThobeType!(id),
    listColors: () => api.getColors ? api.getColors() : Promise.resolve([]),
    createColor: (input) => api.createColor!(input as never),
    updateColor: (input) => api.updateColor!(input as never),
    deleteColor: (id) => api.deleteColor!(id),

    listPurchases: () => api.getPurchases ? api.getPurchases() : Promise.resolve([]),
    createPurchase: (input) => api.createPurchase!(input as never),
    listExpenses: () => api.getExpenses ? api.getExpenses() : Promise.resolve([]),
    createExpense: (input) => api.createExpense!(input as never),
    listCashTransactions: () => api.getCashTransactions ? api.getCashTransactions() : Promise.resolve([]),
    createCashAdjustment: (input) => api.createCashAdjustment!(input as never),

    listCustomerCredits: (customerId, filters) => api.customerCredits!.list(customerId, filters as never),
    customerCreditSummary: (customerId) => api.customerCredits!.summary(customerId),
    applyCustomerCredit: (input) => api.customerCredits!.apply(input as never),
    refundCustomerCredit: (input) => api.customerCredits!.refund(input as never),

    listNotifications: (includeArchived) => api.notifications!.list(includeArchived),
    markNotificationRead: (id) => api.notifications!.markRead(id),
    markAllNotificationsRead: () => api.notifications!.markAllRead(),
    archiveNotifications: () => api.notifications!.clearAll(),
    retryNotification: (id) => api.notifications!.retry(id),
    getSettings: () => api.getSettings ? api.getSettings() : Promise.resolve({}),
    updateSetting: (input) => api.updateSetting!(input as never),
    backupNow: () => api.exportBackup(),
    restoreFromJson: (content) => api.importBackup(String(content)),
    clearAllData: () => api.clearAllData(),
    exportExcel: (startDate, endDate) => api.exportExcelReport!(startDate, endDate),
  };
}
