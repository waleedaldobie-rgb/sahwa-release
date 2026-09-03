import { Migration } from './types';

export const migration001: Migration = {
  version: 1,
  name: 'accessory_purchase_price',
  up(db) {
    const columns = db.pragma('table_info(accessories)') as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'purchase_price')) {
      db.exec('ALTER TABLE accessories ADD COLUMN purchase_price REAL NOT NULL DEFAULT 0');
    }
  }
};
