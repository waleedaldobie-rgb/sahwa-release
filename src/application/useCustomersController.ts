import { Customer } from '../types';
import { validateEntity } from '../domain/validation';
import { AppSession } from './sessionTypes';

export function useCustomersController(session: AppSession) {
  const { data, showToast, executeCrud, loadAppData, offerDeleteUndo, gateway } = session;

  const handleSaveCustomer = async (customer: Customer): Promise<boolean> => {
    const err = validateEntity('customer', customer);
    if (err) {
      showToast(err, 'danger');
      return false;
    }

    const result = await executeCrud('جاري حفظ بيانات العميل...', async () => {
      const exists = data?.customers.some((c) => c.id === customer.id);
      if (exists) {
        await gateway.updateCustomer(customer);
      } else {
        await gateway.createCustomer(customer);
      }
      await loadAppData();
      showToast('تم حفظ بيانات العميل بنجاح', 'success');
      return true;
    });
    return result === true;
  };

  const handleDeleteCustomer = async (customerId: string) => {
    const beforeDelete = data ? JSON.parse(JSON.stringify(data)) as typeof data : null;
    await executeCrud('جاري حذف العميل...', async () => {
      await gateway.deleteCustomer(customerId);
      await loadAppData();
      if (beforeDelete) offerDeleteUndo(beforeDelete, 'تم حذف العميل');
    });
  };

  return { handleSaveCustomer, handleDeleteCustomer };
}
