import { Dispatch, SetStateAction, useCallback, useRef } from 'react';
import { AppData, UserPreferences } from '../types';
import { initElectronMock } from '../services/electronMock';
import { checkAndSyncStockAlerts } from '../utils/stockAlerts';
import { ALL_DATA_SLICES, DataRevision, DataSliceName, bumpDataRevision, mergeDataSlices } from '../state/appDataStore';
import { loadDataSlices, SliceApi } from './dataSlices';
import { SahwaGateway } from './gateway';

function toSliceApi(gateway: SahwaGateway): SliceApi {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  return {
    getData: () => gateway.getData() as Promise<AppData>,
    getCustomers: () => gateway.listCustomers() as ReturnType<NonNullable<SliceApi['getCustomers']>>,
    getOrders: () => gateway.listOrders() as ReturnType<NonNullable<SliceApi['getOrders']>>,
    getInvoices: () => gateway.listInvoices() as ReturnType<NonNullable<SliceApi['getInvoices']>>,
    getFabrics: () => gateway.listFabrics() as ReturnType<NonNullable<SliceApi['getFabrics']>>,
    getAccessories: () => gateway.listAccessories() as ReturnType<NonNullable<SliceApi['getAccessories']>>,
    getPurchases: () => gateway.listPurchases() as ReturnType<NonNullable<SliceApi['getPurchases']>>,
    getExpenses: () => gateway.listExpenses() as ReturnType<NonNullable<SliceApi['getExpenses']>>,
    getCashTransactions: () => gateway.listCashTransactions() as ReturnType<NonNullable<SliceApi['getCashTransactions']>>,
    getStockMovements: api?.getStockMovements,
    getOrderMaterialUsages: api?.getOrderMaterialUsages,
    getOrderEvents: api?.getOrderEvents,
    notifications: api?.notifications ?? {
      list: (includeArchived?: boolean) =>
        gateway.listNotifications(includeArchived) as ReturnType<NonNullable<NonNullable<SliceApi['notifications']>['list']>>,
      markRead: (id: string) => gateway.markNotificationRead(id) as ReturnType<NonNullable<NonNullable<SliceApi['notifications']>['markRead']>>,
      markAllRead: () => gateway.markAllNotificationsRead() as ReturnType<NonNullable<NonNullable<SliceApi['notifications']>['markAllRead']>>,
      clearAll: () => gateway.archiveNotifications() as ReturnType<NonNullable<NonNullable<SliceApi['notifications']>['clearAll']>>,
      retry: (id: string) => gateway.retryNotification(id) as ReturnType<NonNullable<NonNullable<SliceApi['notifications']>['retry']>>,
    },
  };
}

export interface UseAppBootstrapArgs {
  data: AppData | null;
  setData: Dispatch<SetStateAction<AppData | null>>;
  setPrefs: Dispatch<SetStateAction<UserPreferences>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setDataRevision: Dispatch<SetStateAction<DataRevision>>;
  setLastUpdatedAt: Dispatch<SetStateAction<number | null>>;
  gateway: SahwaGateway;
}

export function useAppBootstrap({
  data,
  setData,
  setPrefs,
  setIsLoading,
  setDataRevision,
  setLastUpdatedAt,
  gateway,
}: UseAppBootstrapArgs) {
  const loadInFlightRef = useRef<Promise<string[]> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const loadAppData = useCallback(async (): Promise<string[]> => {
    if (loadInFlightRef.current !== null) return loadInFlightRef.current;

    const request = (async () => {
      setIsLoading(true);
      initElectronMock();
      const [appData, appPrefs] = await Promise.all([
        gateway.getData() as Promise<AppData>,
        window.electronAPI.getPreferences(),
      ]);

      const { updatedData, alertMessages } = checkAndSyncStockAlerts(appData);
      if (updatedData !== appData) {
        await gateway.saveData(updatedData);
      }

      setData(updatedData);
      setDataRevision((current) => bumpDataRevision(current, ALL_DATA_SLICES));
      setLastUpdatedAt(Date.now());
      setPrefs(appPrefs);
      setIsLoading(false);
      return alertMessages;
    })();

    loadInFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (loadInFlightRef.current === request) loadInFlightRef.current = null;
    }
  }, [gateway, setData, setDataRevision, setIsLoading, setLastUpdatedAt, setPrefs]);

  const persistData = useCallback(async (updatedData: AppData): Promise<string[]> => {
    const { updatedData: syncedData, alertMessages } = checkAndSyncStockAlerts(updatedData);
    setData(syncedData);
    setDataRevision((current) => bumpDataRevision(current, ALL_DATA_SLICES));
    await gateway.saveData(syncedData);
    return alertMessages;
  }, [gateway, setData, setDataRevision]);

  const refreshSlices = useCallback(async (slices: readonly DataSliceName[]): Promise<string[]> => {
    const current = dataRef.current;
    if (!current) return [];
    const patch = await loadDataSlices(slices, toSliceApi(gateway));
    const mergedData = mergeDataSlices(current, patch);
    const { updatedData, alertMessages } = checkAndSyncStockAlerts(mergedData);
    if (updatedData !== mergedData) await gateway.saveData(updatedData);
    setData(updatedData);
    setDataRevision((revision) => bumpDataRevision(revision, slices));
    setLastUpdatedAt(Date.now());
    return alertMessages;
  }, [gateway, setData, setDataRevision, setLastUpdatedAt]);

  return { loadAppData, persistData, refreshSlices, loadInFlightRef };
}
