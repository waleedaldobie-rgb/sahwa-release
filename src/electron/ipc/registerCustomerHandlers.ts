import { ipcMain } from 'electron';
import { safeIpcHandle } from '../errorHandler';
import { CustomerService } from '../services/customerService';
import { Customer } from '../../types';
import {
  customerCreateSchema,
  customerUpdateSchema,
  saveMeasurementHistoryArgsSchema,
  idArgsSchema,
} from '../../services/shared/ipcSchemas';
import { parseIpcInput } from '../validation/parseIpc';

export function registerCustomerHandlers(customerService: CustomerService): void {
  safeIpcHandle(ipcMain, 'customers:list', async () => customerService.list());
  safeIpcHandle(ipcMain, 'customers:create', async (_, raw: unknown) => {
    const input = parseIpcInput(customerCreateSchema, raw, 'بيانات العميل');
    return customerService.create(input as unknown as Partial<Customer>);
  });
  safeIpcHandle(ipcMain, 'customers:update', async (_, raw: unknown) => {
    const input = parseIpcInput(customerUpdateSchema, raw, 'بيانات العميل');
    return customerService.update(input as unknown as Customer);
  });
  safeIpcHandle(ipcMain, 'customers:delete', async (_, customerId: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id: customerId }, 'معرّف العميل');
    return customerService.delete(input.id);
  });
  safeIpcHandle(ipcMain, 'customers:saveMeasurementHistory', async (_, customerId: unknown, note: unknown) => {
    const input = parseIpcInput(saveMeasurementHistoryArgsSchema, { id: customerId, note }, 'سجل القياسات');
    return customerService.saveMeasurementHistory(input.id, input.note ?? '');
  });
}
