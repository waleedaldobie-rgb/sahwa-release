import { Migration } from './types';

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export const migration016: Migration = {
  version: 16,
  name: 'order_multiple_garments',
  up(db) {
    addColumnIfMissing(db, 'orders', 'garments_json', "TEXT NOT NULL DEFAULT '[]'");
  }
};
