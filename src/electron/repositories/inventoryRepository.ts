import Database from 'better-sqlite3';
import { InventoryItemType } from '../../types';

export interface InventoryMeta {
  table: 'fabrics' | 'accessories';
  quantityColumn: 'quantity_meters' | 'quantity';
  id: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  unit: string;
}

export class InventoryRepository {
  constructor(private readonly db: Database.Database) {}

  getMeta(itemType: InventoryItemType, itemId: string): InventoryMeta {
    if (itemType === 'fabric') {
      const row = this.db.prepare("SELECT id, name, quantity_meters AS quantity, purchase_price AS purchasePrice, 'متر' AS unit FROM fabrics WHERE id = ?").get(itemId) as any;
      if (!row) throw new Error('صنف القماش غير موجود');
      return { table: 'fabrics', quantityColumn: 'quantity_meters', ...row };
    }
    if (itemType === 'accessory') {
      const row = this.db.prepare('SELECT id, name, quantity, purchase_price AS purchasePrice, unit FROM accessories WHERE id = ?').get(itemId) as any;
      if (!row) throw new Error('صنف الإكسسوار غير موجود');
      return { table: 'accessories', quantityColumn: 'quantity', ...row };
    }
    throw new Error('نوع الصنف غير مدعوم');
  }

  updateQuantity(meta: InventoryMeta, quantity: number, itemId: string): void {
    this.db.prepare(`UPDATE ${meta.table} SET ${meta.quantityColumn} = ? WHERE id = ?`).run(quantity, itemId);
  }

  updateWac(meta: InventoryMeta, unitCost: number, itemId: string): void {
    this.db.prepare(`UPDATE ${meta.table} SET purchase_price = ? WHERE id = ?`).run(unitCost, itemId);
  }

  insertMovement(row: {
    id: string;
    itemType: InventoryItemType;
    itemId: string;
    itemName: string;
    direction: string;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    unit: string;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    referenceNumber?: string;
    unitCost?: number;
    totalCost?: number;
    sourceMovementId?: string;
    actorId?: string;
    createdAt: string;
  }): void {
    this.db.prepare(`
      INSERT INTO inventory_movements (
        id, item_type, item_id, item_name, direction, quantity, quantity_before,
        quantity_after, unit, reason, reference_type, reference_id, reference_number,
        unit_cost, total_cost, source_movement_id, actor_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.itemType, row.itemId, row.itemName, row.direction, row.quantity,
      row.quantityBefore, row.quantityAfter, row.unit, row.reason,
      row.referenceType || null, row.referenceId || null, row.referenceNumber || null,
      row.unitCost ?? null, row.totalCost ?? null, row.sourceMovementId || null, row.actorId || null, row.createdAt
    );
  }

  findMovement(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM inventory_movements WHERE id = ?').get(id);
  }

  listMovements(itemType?: InventoryItemType, itemId?: string): any[] {
    let query = 'SELECT * FROM inventory_movements';
    const params: string[] = [];
    const filters: string[] = [];
    if (itemType) { filters.push('item_type = ?'); params.push(itemType); }
    if (itemId) { filters.push('item_id = ?'); params.push(itemId); }
    if (filters.length) query += ` WHERE ${filters.join(' AND ')}`;
    query += ' ORDER BY created_at DESC';
    return this.db.prepare(query).all(...params);
  }
}
