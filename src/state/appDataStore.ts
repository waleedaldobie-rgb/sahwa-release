import { AppData } from '../types';

export type DataSliceName = keyof Pick<
  AppData,
  | 'customers'
  | 'orders'
  | 'invoices'
  | 'fabrics'
  | 'accessories'
  | 'purchases'
  | 'expenses'
  | 'cashTransactions'
  | 'stockMovements'
  | 'orderMaterialUsages'
  | 'orderEvents'
  | 'notifications'
>;

export interface DataRevision {
  global: number;
  orders: number;
  inventory: number;
  accounting: number;
  customers: number;
}

export const ALL_DATA_SLICES: readonly DataSliceName[] = [
  'customers', 'orders', 'invoices', 'fabrics', 'accessories', 'purchases',
  'expenses', 'cashTransactions', 'stockMovements', 'orderMaterialUsages',
  'orderEvents', 'notifications'
];

export const INITIAL_DATA_REVISION: DataRevision = {
  global: 0,
  orders: 0,
  inventory: 0,
  accounting: 0,
  customers: 0
};

export function bumpDataRevision(current: DataRevision, slices: readonly DataSliceName[]): DataRevision {
  const next = { ...current, global: current.global + 1 };
  if (slices.some((slice) => slice === 'orders' || slice === 'invoices' || slice === 'orderMaterialUsages' || slice === 'orderEvents')) {
    next.orders += 1;
  }
  if (slices.some((slice) => slice === 'fabrics' || slice === 'accessories' || slice === 'stockMovements' || slice === 'purchases')) {
    next.inventory += 1;
  }
  if (slices.some((slice) => slice === 'expenses' || slice === 'cashTransactions' || slice === 'purchases')) {
    next.accounting += 1;
  }
  if (slices.includes('customers')) next.customers += 1;
  return next;
}

export function mergeDataSlices(current: AppData, patch: Partial<AppData>): AppData {
  return { ...current, ...patch };
}
