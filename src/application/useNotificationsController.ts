import { AppSession } from './sessionTypes';

export function useNotificationsController(session: AppSession) {
  const { data, executeCrud, refreshSlices, gateway } = session;

  const handleMarkAllNotificationsRead = async () => {
    if (!data) return;
    await executeCrud('جاري تحديث التنبيهات...', async () => {
      await gateway.markAllNotificationsRead();
      await refreshSlices(['notifications']);
    });
  };

  const handleClearNotifications = async () => {
    if (!data) return;
    await executeCrud('جاري مسح التنبيهات...', async () => {
      await gateway.archiveNotifications();
      await refreshSlices(['notifications']);
    });
  };

  return { handleMarkAllNotificationsRead, handleClearNotifications };
}
