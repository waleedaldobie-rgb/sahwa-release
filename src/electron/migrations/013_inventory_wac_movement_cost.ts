import { Migration } from './types';

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const migration013: Migration = {
  version: 13,
  name: 'inventory_wac_movement_cost_provenance',
  up(db) {
    addColumnIfMissing(db, 'inventory_movements', 'unit_cost', 'REAL');
    addColumnIfMissing(db, 'inventory_movements', 'total_cost', 'REAL');
    addColumnIfMissing(db, 'inventory_movements', 'source_movement_id', 'TEXT');
    addColumnIfMissing(db, 'inventory_movements', 'actor_id', 'TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_source_movement
        ON inventory_movements(source_movement_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_cost_reference
        ON inventory_movements(reference_type, reference_id, item_type, item_id);
    `);
  }
};
