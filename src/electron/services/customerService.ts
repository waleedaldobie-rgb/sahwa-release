import { Customer } from '../../types';
import { normalizeMeasurements, normalizeStyleDetails } from '../../services/shared/measurementDefaults';
import { createSafeId } from '../../domain/idGenerator';
import { CustomerRepository, CustomerRow } from '../repositories/customerRepository';

const parseMeasurements = (value?: string) => {
  try { return normalizeMeasurements(JSON.parse(value || '{}')); }
  catch { return normalizeMeasurements(); }
};

const parseStyleDetails = (value?: string) => {
  try { return normalizeStyleDetails(JSON.parse(value || '{}')); }
  catch { return normalizeStyleDetails(); }
};

const createHistoryId = () => createSafeId('HIST');

export class CustomerService {
  constructor(
    private readonly repository: CustomerRepository,
    private readonly db: { transaction<T>(callback: () => T): () => T }
  ) {}

  list(): Customer[] {
    const historyMap = new Map<string, any[]>();
    for (const history of this.repository.listMeasurementHistory()) {
      const list = historyMap.get(history.customer_id) || [];
      list.push({
        id: history.id,
        savedAt: history.saved_at,
        note: history.note || '',
        measurements: parseMeasurements(history.measurements_json),
        styleDetails: parseStyleDetails(history.style_details_json)
      });
      historyMap.set(history.customer_id, list);
    }

    return this.repository.list().map((customer) => this.toCustomer(customer, historyMap.get(customer.id) || []));
  }

  create(input: Partial<Customer>): Customer {
    const id = input.id || createSafeId('CUST');
    const name = input.name || 'عميل جديد';
    const phone = (input.phone || '').trim();
    const createdAt = input.createdAt || new Date().toISOString().slice(0, 10);
    if (this.repository.findByPhone(phone)) throw new Error('رقم الجوال مسجل بالفعل لعميل آخر');
    const customerNumber = this.repository.nextCustomerNumber();

    const measurements = normalizeMeasurements(input.measurements);
    const styleDetails = normalizeStyleDetails(input.styleDetails);
    this.repository.insert({
      id,
      customerNumber,
      name,
      phone,
      createdAt,
      measurementsJson: JSON.stringify(measurements),
      styleDetailsJson: JSON.stringify(styleDetails)
    });
    return { id, customerNumber, name, phone, createdAt, updatedAt: createdAt, measurements, styleDetails, measurementHistory: [] };
  }

  update(customer: Customer): boolean {
    const phone = (customer.phone || '').trim();
    if (this.repository.findByPhoneExcludingId(phone, customer.id)) throw new Error('رقم الجوال مسجل بالفعل لعميل آخر');

    const existing = this.repository.findById(customer.id);
    if (!existing) throw new Error('العميل المطلوب غير موجود');

    const measurements = normalizeMeasurements(customer.measurements);
    const styleDetails = normalizeStyleDetails(customer.styleDetails);
    const measurementsJson = JSON.stringify(measurements);
    const styleDetailsJson = JSON.stringify(styleDetails);
    const hasMeasurementChanges = existing.measurements_json !== measurementsJson
      || existing.style_details_json !== styleDetailsJson;
    const updatedAt = new Date().toISOString();

    const updateTx = this.db.transaction(() => {
      if (hasMeasurementChanges) {
        this.repository.insertMeasurementHistory({
          id: createHistoryId(),
          customerId: customer.id,
          savedAt: updatedAt,
          note: 'نسخة سابقة قبل إنشاء مقاس جديد',
          measurementsJson: existing.measurements_json,
          styleDetailsJson: existing.style_details_json
        });
      }

      this.repository.update({
        id: customer.id,
        name: customer.name,
        phone,
        measurementsJson,
        styleDetailsJson,
        updatedAt
      });
    });
    updateTx();
    return true;
  }

  delete(id: string): boolean {
    this.repository.deleteById(id);
    return true;
  }

  saveMeasurementHistory(customerId: string, note: string): any {
    const customer = this.repository.findById(customerId);
    if (!customer) throw new Error('العميل غير موجود في قاعدة البيانات');
    const id = createHistoryId();
    const savedAt = new Date().toISOString().slice(0, 10);
    const safeNote = note || 'تحديث مقاسات';
    this.repository.insertMeasurementHistory({
      id,
      customerId,
      savedAt,
      note: safeNote,
      measurementsJson: customer.measurements_json,
      styleDetailsJson: customer.style_details_json
    });
    return {
      id,
      savedAt,
      note,
      measurements: parseMeasurements(customer.measurements_json),
      styleDetails: parseStyleDetails(customer.style_details_json)
    };
  }

  private toCustomer(row: CustomerRow, measurementHistory: any[]): Customer {
    return {
      id: row.id,
      customerNumber: row.customer_number ?? undefined,
      name: row.name,
      phone: row.phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
      measurements: parseMeasurements(row.measurements_json),
      styleDetails: parseStyleDetails(row.style_details_json),
      measurementHistory
    };
  }
}
