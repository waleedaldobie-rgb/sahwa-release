import Database from 'better-sqlite3';

export interface CustomerRow {
  id: string;
  customer_number?: number | null;
  name: string;
  phone: string;
  created_at: string;
  updated_at?: string | null;
  measurements_json: string;
  style_details_json: string;
}

export interface CustomerHistoryRow {
  id: string;
  customer_id: string;
  saved_at: string;
  note: string;
  measurements_json: string;
  style_details_json: string;
}

export class CustomerRepository {
  constructor(private readonly db: Database.Database) {}

  list(): CustomerRow[] {
    return this.db.prepare('SELECT * FROM customers ORDER BY name ASC').all() as CustomerRow[];
  }

  listMeasurementHistory(): CustomerHistoryRow[] {
    return this.db.prepare('SELECT * FROM customer_measurement_history ORDER BY saved_at DESC').all() as CustomerHistoryRow[];
  }

  findById(id: string): CustomerRow | undefined {
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
  }

  nextCustomerNumber(): number {
    const row = this.db.prepare(`
      INSERT INTO visible_number_sequences (name, next_number)
      VALUES ('customers', 2)
      ON CONFLICT(name) DO UPDATE SET next_number = visible_number_sequences.next_number + 1
      RETURNING next_number - 1 AS allocated
    `).get() as { allocated: number };
    return row.allocated;
  }

  findByPhone(phone: string): Pick<CustomerRow, 'id'> | undefined {
    return this.db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone) as Pick<CustomerRow, 'id'> | undefined;
  }

  findByPhoneExcludingId(phone: string, id: string): Pick<CustomerRow, 'id'> | undefined {
    return this.db.prepare('SELECT id FROM customers WHERE phone = ? AND id != ?').get(phone, id) as Pick<CustomerRow, 'id'> | undefined;
  }

  insert(row: {
    id: string;
    name: string;
    phone: string;
    createdAt: string;
    updatedAt?: string | null;
    measurementsJson: string;
    styleDetailsJson: string;
    customerNumber: number;
  }): void {
    this.db.prepare(`
      INSERT INTO customers (id, customer_number, name, phone, created_at, updated_at, measurements_json, style_details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.customerNumber,
      row.name,
      row.phone,
      row.createdAt,
      row.updatedAt || row.createdAt,
      row.measurementsJson,
      row.styleDetailsJson
    );
  }

  update(row: {
    id: string;
    name: string;
    phone: string;
    measurementsJson: string;
    styleDetailsJson: string;
    updatedAt: string;
  }): void {
    this.db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, measurements_json = ?, style_details_json = ?, updated_at = ?
      WHERE id = ?
    `).run(row.name, row.phone, row.measurementsJson, row.styleDetailsJson, row.updatedAt, row.id);
  }

  deleteById(id: string): void {
    this.db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  }

  insertMeasurementHistory(row: {
    id: string;
    customerId: string;
    savedAt: string;
    note: string;
    measurementsJson: string;
    styleDetailsJson: string;
  }): void {
    this.db.prepare(`
      INSERT INTO customer_measurement_history (id, customer_id, saved_at, note, measurements_json, style_details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.id, row.customerId, row.savedAt, row.note, row.measurementsJson, row.styleDetailsJson);
  }
}
