import { AppData } from '../types';
import { DataSliceName } from '../state/appDataStore';

export type SliceApi = Pick<
  Window['electronAPI'],
  | 'getCustomers'
  | 'getOrders'
  | 'getInvoices'
  | 'getFabrics'
  | 'getAccessories'
  | 'getPurchases'
  | 'getExpenses'
  | 'getCashTransactions'
  | 'getStockMovements'
  | 'getOrderMaterialUsages'
  | 'getOrderEvents'
  | 'getData'
  | 'notifications'
>;

export async function loadDataSlice(slice: DataSliceName, api: SliceApi): Promise<Partial<AppData>> {
  switch (slice) {
    case 'customers':
      return api.getCustomers ? { customers: await api.getCustomers() } : {};
    case 'orders': {
      if (!api.getOrders) return {};
      const result = await api.getOrders();
      return { orders: Array.isArray(result) ? result : result.items };
    }
    case 'invoices':
      return api.getInvoices ? { invoices: await api.getInvoices() } : {};
    case 'fabrics':
      return api.getFabrics ? { fabrics: await api.getFabrics() } : {};
    case 'accessories':
      return api.getAccessories ? { accessories: await api.getAccessories() } : {};
    case 'purchases':
      return api.getPurchases ? { purchases: await api.getPurchases() } : {};
    case 'expenses':
      return api.getExpenses ? { expenses: await api.getExpenses() } : {};
    case 'cashTransactions':
      return api.getCashTransactions ? { cashTransactions: await api.getCashTransactions() } : {};
    case 'stockMovements':
      return api.getStockMovements ? { stockMovements: await api.getStockMovements() } : {};
    case 'orderMaterialUsages':
      return api.getOrderMaterialUsages ? { orderMaterialUsages: await api.getOrderMaterialUsages() } : {};
    case 'orderEvents':
      return api.getOrderEvents ? { orderEvents: await api.getOrderEvents() } : {};
    case 'notifications': {
      if (api.notifications?.list) {
        return { notifications: await api.notifications.list() };
      }
      const snapshot = await api.getData();
      return { notifications: snapshot.notifications };
    }
    default:
      return {};
  }
}

export async function loadDataSlices(slices: readonly DataSliceName[], api: SliceApi): Promise<Partial<AppData>> {
  const patches = await Promise.all(slices.map((slice) => loadDataSlice(slice, api)));
  return Object.assign({}, ...patches) as Partial<AppData>;
}
