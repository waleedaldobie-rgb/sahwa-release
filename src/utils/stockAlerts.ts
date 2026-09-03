import { AppData, NotificationItem } from '../types';

interface StockCheckItem {
  id: string;
  name: string;
  quantity: number;
  minStock: number;
  unitLabel: string;
}

interface StockKindConfig {
  idPrefix: string;
  title: string;
  itemLabel: string;
  minStockSuffix: string;
}

const FABRIC_KIND: StockKindConfig = {
  idPrefix: 'NOTIF-FAB-',
  title: 'تنبيه حد الطلب الأدنى (أقمشة)',
  itemLabel: 'القماش',
  minStockSuffix: ' متر',
};

const ACCESSORY_KIND: StockKindConfig = {
  idPrefix: 'NOTIF-ACC-',
  title: 'تنبيه حد الطلب الأدنى (إكسسوارات)',
  itemLabel: 'الإكسسوار',
  minStockSuffix: '',
};

function findStockNotifIndex(
  notifications: NotificationItem[],
  kind: StockKindConfig,
  item: StockCheckItem,
): number {
  return notifications.findIndex(
    (n) => n.type === 'stock' && (n.id === `${kind.idPrefix}${item.id}` || n.message.includes(`"${item.name}"`)),
  );
}

function syncStockItemAlerts(
  items: StockCheckItem[],
  kind: StockKindConfig,
  notificationsList: NotificationItem[],
  nowFormatted: string,
  showToastFn: ((msg: string, type: 'warning') => void) | undefined,
  state: { newAlertsCount: number; alertMessages: string[]; dataModified: boolean },
): NotificationItem[] {
  let next = notificationsList;

  for (const item of items) {
    const isLow = item.quantity <= item.minStock;
    const notifIndex = findStockNotifIndex(next, kind, item);
    const alertMsg = `تنبيه مخزون: ${kind.itemLabel} "${item.name}" وصل للحد الأدنى للمخزون (${item.quantity} ${item.unitLabel} المتبقية / الحد الأدنى: ${item.minStock}${kind.minStockSuffix})`;

    if (isLow) {
      if (notifIndex === -1) {
        const newNotif: NotificationItem = {
          id: `${kind.idPrefix}${item.id}`,
          type: 'stock',
          title: kind.title,
          message: alertMsg,
          date: nowFormatted,
          read: false,
        };
        next = [newNotif, ...next];
        state.newAlertsCount++;
        state.alertMessages.push(alertMsg);
        state.dataModified = true;
        if (showToastFn) showToastFn(alertMsg, 'warning');
      } else {
        const existing = next[notifIndex];
        if (existing.message !== alertMsg) {
          next[notifIndex] = {
            ...existing,
            message: alertMsg,
            read: false,
            date: nowFormatted,
          };
          state.newAlertsCount++;
          state.alertMessages.push(alertMsg);
          state.dataModified = true;
          if (showToastFn) showToastFn(alertMsg, 'warning');
        }
      }
    } else if (notifIndex !== -1) {
      next.splice(notifIndex, 1);
      state.dataModified = true;
    }
  }

  return next;
}

/**
 * Evaluates stock levels for all fabrics and accessories in appData against their minimum stock thresholds (minStockMeters / minStock).
 * Automatically creates, updates, or clears low stock notifications in appData.notifications.
 */
export function checkAndSyncStockAlerts(
  appData: AppData,
  showToastFn?: (msg: string, type: 'warning') => void
): { updatedData: AppData; newAlertCount: number; alertMessages: string[] } {
  if (!appData || !appData.fabrics || !appData.accessories) {
    return { updatedData: appData, newAlertCount: 0, alertMessages: [] };
  }

  let notificationsList = [...(appData.notifications || [])];
  const state = { newAlertsCount: 0, alertMessages: [] as string[], dataModified: false };
  const nowFormatted = new Date().toLocaleDateString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  const fabrics: StockCheckItem[] = appData.fabrics
    .filter((f) => typeof f.quantityMeters === 'number' && typeof f.minStockMeters === 'number')
    .map((f) => ({
      id: f.id,
      name: f.name,
      quantity: f.quantityMeters,
      minStock: f.minStockMeters,
      unitLabel: 'متر',
    }));

  const accessories: StockCheckItem[] = appData.accessories
    .filter((a) => typeof a.quantity === 'number' && typeof a.minStock === 'number')
    .map((a) => ({
      id: a.id,
      name: a.name,
      quantity: a.quantity,
      minStock: a.minStock,
      unitLabel: a.unit || 'حبة',
    }));

  notificationsList = syncStockItemAlerts(fabrics, FABRIC_KIND, notificationsList, nowFormatted, showToastFn, state);
  notificationsList = syncStockItemAlerts(accessories, ACCESSORY_KIND, notificationsList, nowFormatted, showToastFn, state);

  const fabricIds = new Set(appData.fabrics.map((f) => f.id));
  const fabricNames = new Set(appData.fabrics.map((f) => f.name));
  const accIds = new Set(appData.accessories.map((a) => a.id));
  const accNames = new Set(appData.accessories.map((a) => a.name));

  const initialCount = notificationsList.length;
  notificationsList = notificationsList.filter((n) => {
    if (n.type !== 'stock') return true;
    if (n.title.includes('أقمشة')) {
      const fabIdMatch = n.id.replace('NOTIF-FAB-', '');
      if (fabricIds.has(fabIdMatch)) return true;
      return Array.from(fabricNames).some((name) => n.message.includes(`"${name}"`));
    }
    if (n.title.includes('إكسسوارات')) {
      const accIdMatch = n.id.replace('NOTIF-ACC-', '');
      if (accIds.has(accIdMatch)) return true;
      return Array.from(accNames).some((name) => n.message.includes(`"${name}"`));
    }
    return true;
  });

  if (notificationsList.length !== initialCount) {
    state.dataModified = true;
  }

  if (state.dataModified) {
    return {
      updatedData: {
        ...appData,
        notifications: notificationsList,
      },
      newAlertCount: state.newAlertsCount,
      alertMessages: state.alertMessages,
    };
  }

  return { updatedData: appData, newAlertCount: 0, alertMessages: [] };
}
