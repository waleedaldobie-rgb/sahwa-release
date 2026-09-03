import { AppSession } from './sessionTypes';

export function useAccountingController(session: AppSession) {
  const { showToast, executeCrud, refreshSlices, gateway } = session;

  const handleCreatePurchase = async (payload: unknown): Promise<boolean> => {
    const result = await executeCrud('جاري اعتماد المشتريات وتحديث المخزون والصندوق...', async () => {
      await gateway.createPurchase(payload);
      await refreshSlices(['purchases', 'stockMovements', 'cashTransactions', 'fabrics', 'accessories', 'notifications']);
      showToast('تم اعتماد المشتريات وتحديث المخزون والصندوق بنجاح', 'success');
      return true;
    });
    return result === true;
  };

  const handleCreateExpense = async (payload: unknown): Promise<boolean> => {
    const result = await executeCrud('جاري تسجيل المصروف...', async () => {
      await gateway.createExpense(payload);
      await refreshSlices(['expenses', 'cashTransactions']);
      showToast('تم تسجيل المصروف في الصندوق بنجاح', 'success');
      return true;
    });
    return result === true;
  };

  const handleCreateCashAdjustment = async (payload: unknown): Promise<boolean> => {
    const result = await executeCrud('جاري تسجيل الحركة المالية...', async () => {
      await gateway.createCashAdjustment(payload);
      await refreshSlices(['cashTransactions']);
      showToast('تم تسجيل الحركة المالية بنجاح', 'success');
      return true;
    });
    return result === true;
  };

  return { handleCreatePurchase, handleCreateExpense, handleCreateCashAdjustment };
}
