import { AppData, Customer, MeasurementHistoryRecord } from '../../types';
import { normalizeMeasurements, normalizeStyleDetails } from '../shared/measurementDefaults';
import { createSafeId } from '../../domain/idGenerator';

export function createCustomerInDraft(draft: AppData, customer: Partial<Customer>): Customer {
  const nextCustomerNumber = draft.customers.reduce((max, item) => Math.max(max, Number(item.customerNumber) || 0), 0) + 1;
  const newCustomer: Customer = {
    id: customer.id || createSafeId('CUST'),
    customerNumber: nextCustomerNumber,
    name: customer.name || 'عميل جديد',
    phone: customer.phone || '',
    createdAt: customer.createdAt || new Date().toISOString().slice(0, 10),
    measurements: normalizeMeasurements(customer.measurements),
    styleDetails: normalizeStyleDetails(customer.styleDetails),
    measurementHistory: (customer.measurementHistory || []).map(normalizeHistory)
  };
  draft.customers = [newCustomer, ...draft.customers];
  return newCustomer;
}

export function updateCustomerInDraft(draft: AppData, customer: Customer): boolean {
  const current = draft.customers.find((item) => item.id === customer.id);
  if (!current) throw new Error('العميل المطلوب غير موجود');

  const nextMeasurements = normalizeMeasurements(customer.measurements);
  const nextStyleDetails = normalizeStyleDetails(customer.styleDetails);
  const measurementChanged = JSON.stringify(current.measurements) !== JSON.stringify(nextMeasurements)
    || JSON.stringify(current.styleDetails) !== JSON.stringify(nextStyleDetails);
  const now = new Date().toISOString();
  const history = measurementChanged
    ? [{
        id: createSafeId('HIST'),
        savedAt: now,
        note: 'نسخة سابقة قبل إنشاء مقاس جديد',
        measurements: { ...current.measurements },
        styleDetails: { ...current.styleDetails }
      }, ...(current.measurementHistory || [])]
    : (current.measurementHistory || []);

  draft.customers = draft.customers.map((item) => item.id === customer.id
    ? {
        ...customer,
        updatedAt: measurementChanged ? now : customer.updatedAt || current.updatedAt,
        measurements: nextMeasurements,
        styleDetails: nextStyleDetails,
        measurementHistory: history
      }
    : item);
  return true;
}

export function saveCustomerMeasurementHistoryInDraft(
  draft: AppData,
  id: string,
  note: string
): MeasurementHistoryRecord {
  const customer = draft.customers.find((item) => item.id === id);
  if (!customer) throw new Error('العميل غير موجود في قاعدة البيانات');
  const newHistory: MeasurementHistoryRecord = {
    id: createSafeId('HIST'),
    savedAt: new Date().toISOString().slice(0, 10),
    note,
    measurements: { ...customer.measurements },
    styleDetails: { ...customer.styleDetails }
  };
  draft.customers = draft.customers.map((item) => item.id === id
    ? { ...item, measurementHistory: [newHistory, ...(item.measurementHistory || [])] }
    : item);
  return newHistory;
}

function normalizeHistory(history: MeasurementHistoryRecord): MeasurementHistoryRecord {
  return {
    ...history,
    measurements: normalizeMeasurements(history.measurements),
    styleDetails: normalizeStyleDetails(history.styleDetails)
  };
}
