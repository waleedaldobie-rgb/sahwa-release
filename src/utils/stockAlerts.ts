import { AppData, NotificationItem } from '../types';

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
  let newAlertsCount = 0;
  const alertMessages: string[] = [];
  let dataModified = false;

  const nowFormatted = new Date().toLocaleDateString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  // 1. Check Fabrics against minStockMeters
  appData.fabrics.forEach((fabric) => {
    if (typeof fabric.quantityMeters === 'number' && typeof fabric.minStockMeters === 'number') {
      const isLow = fabric.quantityMeters <= fabric.minStockMeters;
      const notifIndex = notificationsList.findIndex(
        (n) => n.type === 'stock' && (n.id === `NOTIF-FAB-${fabric.id}` || n.message.includes(`"${fabric.name}"`))
      );

      const alertMsg = `تنبيه مخزون: القماش "${fabric.name}" وصل للحد الأدنى للمخزون (${fabric.quantityMeters} متر المتبقية / الحد الأدنى: ${fabric.minStockMeters} متر)`;

      if (isLow) {
        if (notifIndex === -1) {
          const newNotif: NotificationItem = {
            id: `NOTIF-FAB-${fabric.id}`,
            type: 'stock',
            title: 'تنبيه حد الطلب الأدنى (أقمشة)',
            message: alertMsg,
            date: nowFormatted,
            read: false
          };
          notificationsList = [newNotif, ...notificationsList];
          newAlertsCount++;
          alertMessages.push(alertMsg);
          dataModified = true;
          if (showToastFn) {
            showToastFn(alertMsg, 'warning');
          }
        } else {
          // If notification already exists, check if message or quantity changed
          const existing = notificationsList[notifIndex];
          if (existing.message !== alertMsg) {
            notificationsList[notifIndex] = {
              ...existing,
              message: alertMsg,
              read: false, // Mark unread again due to stock level change
              date: nowFormatted
            };
            newAlertsCount++;
            alertMessages.push(alertMsg);
            dataModified = true;
            if (showToastFn) {
              showToastFn(alertMsg, 'warning');
            }
          }
        }
      } else {
        // Quantity is above minStock -> clear alert if present
        if (notifIndex !== -1) {
          notificationsList.splice(notifIndex, 1);
          dataModified = true;
        }
      }
    }
  });

  // 2. Check Accessories against minStock
  appData.accessories.forEach((acc) => {
    if (typeof acc.quantity === 'number' && typeof acc.minStock === 'number') {
      const isLow = acc.quantity <= acc.minStock;
      const notifIndex = notificationsList.findIndex(
        (n) => n.type === 'stock' && (n.id === `NOTIF-ACC-${acc.id}` || n.message.includes(`"${acc.name}"`))
      );

      const alertMsg = `تنبيه مخزون: الإكسسوار "${acc.name}" وصل للحد الأدنى للمخزون (${acc.quantity} ${acc.unit || 'حبة'} المتبقية / الحد الأدنى: ${acc.minStock})`;

      if (isLow) {
        if (notifIndex === -1) {
          const newNotif: NotificationItem = {
            id: `NOTIF-ACC-${acc.id}`,
            type: 'stock',
            title: 'تنبيه حد الطلب الأدنى (إكسسوارات)',
            message: alertMsg,
            date: nowFormatted,
            read: false
          };
          notificationsList = [newNotif, ...notificationsList];
          newAlertsCount++;
          alertMessages.push(alertMsg);
          dataModified = true;
          if (showToastFn) {
            showToastFn(alertMsg, 'warning');
          }
        } else {
          // If notification already exists, check if message or quantity changed
          const existing = notificationsList[notifIndex];
          if (existing.message !== alertMsg) {
            notificationsList[notifIndex] = {
              ...existing,
              message: alertMsg,
              read: false, // Mark unread again
              date: nowFormatted
            };
            newAlertsCount++;
            alertMessages.push(alertMsg);
            dataModified = true;
            if (showToastFn) {
              showToastFn(alertMsg, 'warning');
            }
          }
        }
      } else {
        // Quantity is above minStock -> clear alert if present
        if (notifIndex !== -1) {
          notificationsList.splice(notifIndex, 1);
          dataModified = true;
        }
      }
    }
  });

  // 3. Clean up notifications for deleted fabrics or accessories
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
    dataModified = true;
  }

  if (dataModified) {
    return {
      updatedData: {
        ...appData,
        notifications: notificationsList
      },
      newAlertCount: newAlertsCount,
      alertMessages
    };
  }

  return { updatedData: appData, newAlertCount: 0, alertMessages: [] };
}
