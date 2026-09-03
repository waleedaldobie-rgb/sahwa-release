import Database from 'better-sqlite3';
import { FabricItem } from '../../types';
import { createSafeId } from '../../domain/idGenerator';

export class FabricRepository {
  constructor(private readonly db: Database.Database) {}

  list(): FabricItem[] {
    const rows = this.db.prepare('SELECT * FROM fabrics ORDER BY name ASC').all() as any[];
    return rows.map((row): FabricItem => ({
      id: row.id,
      name: row.name,
      color: row.color,
      colorHex: row.color_hex,
      purchasePrice: row.purchase_price || 0,
      sellingPrice: row.selling_price || 0,
      quantityMeters: row.quantity_meters || 0,
      minStockMeters: row.min_stock_meters || 0
    }));
  }

  insert(fabric: Partial<FabricItem>): FabricItem {
    const id = fabric.id || createSafeId('FAB');
    const record: FabricItem = {
      id,
      name: fabric.name || 'قماش جديد',
      color: fabric.color || 'أبيض',
      colorHex: fabric.colorHex || '#ffffff',
      purchasePrice: fabric.purchasePrice || 0,
      sellingPrice: fabric.sellingPrice || 0,
      quantityMeters: fabric.quantityMeters || 0,
      minStockMeters: fabric.minStockMeters || 10
    };
    this.db.prepare(`
      INSERT INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.name, record.color, record.colorHex, record.purchasePrice, record.sellingPrice, record.quantityMeters, record.minStockMeters, new Date().toISOString());
    return record;
  }

  update(fabric: FabricItem): void {
    const current = this.db.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabric.id) as { quantity_meters?: number } | undefined;
    if (!current) throw new Error('صنف القماش غير موجود');
    this.db.prepare(`
      UPDATE fabrics
      SET name = ?, color = ?, color_hex = ?, purchase_price = ?, selling_price = ?, quantity_meters = ?, min_stock_meters = ?
      WHERE id = ?
    `).run(fabric.name, fabric.color, fabric.colorHex, fabric.purchasePrice, fabric.sellingPrice, current.quantity_meters ?? 0, fabric.minStockMeters, fabric.id);
  }

  delete(id: string): void {
    const existing = this.db.prepare('SELECT id FROM fabrics WHERE id = ?').get(id);
    if (!existing) throw new Error('صنف القماش غير موجود');

    const orderReference = this.db.prepare('SELECT 1 FROM orders WHERE fabric_id = ? LIMIT 1').get(id);
    const usage = this.db.prepare(`
      SELECT 1 FROM order_material_usages
      WHERE item_type = 'fabric' AND item_id = ?
      LIMIT 1
    `).get(id);
    const movement = this.db.prepare(`
      SELECT 1 FROM inventory_movements
      WHERE item_type = 'fabric' AND item_id = ?
      LIMIT 1
    `).get(id);
    const purchaseLine = this.db.prepare(`
      SELECT 1 FROM purchase_lines
      WHERE item_type = 'fabric' AND item_id = ?
      LIMIT 1
    `).get(id);

    if (orderReference || usage || movement || purchaseLine) {
      throw new Error('لا يمكن حذف هذا الصنف لارتباطه بسجل تشغيلي');
    }
    this.db.prepare('DELETE FROM fabrics WHERE id = ?').run(id);
  }
}
