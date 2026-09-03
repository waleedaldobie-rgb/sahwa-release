import { AppData } from '../types';
import { formatIpcErrorMessage } from '../utils/ipcError';
import { SahwaGateway } from './gateway';
import { ShowToast } from './sessionTypes';

export function useBackupController(loadAppData: () => Promise<string[]>, showToast: ShowToast, gateway: SahwaGateway) {
  const offerDeleteUndo = (before: AppData, message: string) => {
    const deletedSnapshot = JSON.parse(JSON.stringify(before)) as AppData;
    void gateway.getData().then((afterDelete) => {
      showToast(message, 'success', {
        label: 'تراجع',
        onClick: () => {
          void (async () => {
            try {
              const current = await gateway.getData();
              if (JSON.stringify(current) !== JSON.stringify(afterDelete)) {
                showToast('لا يمكن التراجع لأن بيانات أخرى تغيّرت بعد الحذف', 'warning');
                return;
              }
              const restoreResult = await gateway.restoreFromJson(JSON.stringify(deletedSnapshot)) as { success?: boolean; error?: string };
              if (restoreResult && restoreResult.success === false) {
                showToast(restoreResult.error || 'تعذر التراجع عن الحذف', 'danger');
                return;
              }
              await loadAppData();
              showToast('تم التراجع عن الحذف بنجاح', 'success');
            } catch (err: unknown) {
              showToast(formatIpcErrorMessage(err), 'danger');
            }
          })();
        },
      });
    });
  };

  return { offerDeleteUndo };
}
