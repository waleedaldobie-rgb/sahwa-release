import { Migration } from './types';

export const migration007: Migration = {
  version: 7,
  name: 'accessory_selling_price',
  up(db) {
    const columns = db.pragma('table_info(accessories)') as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'selling_price')) {
      db.exec('ALTER TABLE accessories ADD COLUMN selling_price REAL NOT NULL DEFAULT 0');
    }
  }
};
