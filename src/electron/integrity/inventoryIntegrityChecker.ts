import Database from 'better-sqlite3';
import { round2, round4 } from '../../domain/inventoryRules';
import { IssueCollector, nearlyEqual } from './types';

type SqlRow = Record<string, unknown>;

export function checkInventoryIntegrity(db: Database.Database, issue: IssueCollector): void {
  const movements = db.prepare('SELECT * FROM inventory_movements ORDER BY item_type, item_id, created_at, rowid').all() as SqlRow[];
  const lastMovementAfter = new Map<string, number>();
  for (const movement of movements) {
    lastMovementAfter.set(`${String(movement.item_type)}:${String(movement.item_id)}`, Number(movement.quantity_after));
  }

  for (const table of ['fabrics', 'accessories'] as const) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as SqlRow[];
    for (const row of rows) {
      const quantity = table === 'fabrics' ? Number(row.quantity_meters) : Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) issue({ code: 'NEGATIVE_STOCK', table, recordId: String(row.id), field: table === 'fabrics' ? 'quantity_meters' : 'quantity', expected: '>= 0', actual: quantity, reason: 'Current stock cannot be negative' });
      const itemType = table === 'fabrics' ? 'fabric' : 'accessory';
      const lastAfter = lastMovementAfter.get(`${itemType}:${String(row.id)}`);
      if (lastAfter !== undefined && !nearlyEqual(quantity, lastAfter)) issue({ code: 'STOCK_MOVEMENT_MISMATCH', table, recordId: String(row.id), field: table === 'fabrics' ? 'quantity_meters' : 'quantity', expected: lastAfter, actual: quantity, reason: 'Current stock differs from the last inventory movement' });
    }
  }

  const fabricIds = new Set((db.prepare('SELECT id FROM fabrics').all() as Array<{ id: string }>).map((row) => String(row.id)));
  const accessoryIds = new Set((db.prepare('SELECT id FROM accessories').all() as Array<{ id: string }>).map((row) => String(row.id)));
  const orderIds = new Set((db.prepare('SELECT id FROM orders').all() as Array<{ id: string }>).map((row) => String(row.id)));
  const purchaseIds = new Set((db.prepare('SELECT id FROM purchases').all() as Array<{ id: string }>).map((row) => String(row.id)));
  const ordersById = new Map<string, { id: string; status: string }>();
  for (const order of db.prepare('SELECT id, status FROM orders').all() as Array<{ id: string; status: string }>) {
    ordersById.set(String(order.id), order);
  }

  const movementItemTables: Record<string, string> = { fabric: 'fabrics', accessory: 'accessories' };
  const movementReferenceTables: Record<string, string> = {
    order: 'orders', order_update: 'orders', order_delete: 'orders', order_cancel: 'orders', order_reactivate: 'orders', purchase: 'purchases'
  };
  const referenceIdSets: Record<string, Set<string>> = { orders: orderIds, purchases: purchaseIds };

  for (const movement of movements) {
    const itemType = String(movement.item_type || '');
    const itemTable = movementItemTables[itemType];
    if (!itemTable) {
      issue({ code: 'INVALID_MOVEMENT_ITEM_TYPE', table: 'inventory_movements', recordId: String(movement.id), field: 'item_type', expected: Object.keys(movementItemTables), actual: movement.item_type, reason: 'Inventory movement item_type is not supported', severity: 'critical' });
    } else {
      const itemExists = itemType === 'fabric' ? fabricIds.has(String(movement.item_id)) : accessoryIds.has(String(movement.item_id));
      if (!itemExists) {
        issue({ code: 'ORPHAN_INVENTORY_MOVEMENT', table: 'inventory_movements', recordId: String(movement.id), field: 'item_id', expected: `${itemType}:${movement.item_id}`, actual: null, reason: 'Inventory movement points to a missing Fabric or Accessory', severity: 'critical' });
      }
    }

    const referenceType = movement.reference_type ? String(movement.reference_type) : '';
    const referenceId = movement.reference_id ? String(movement.reference_id) : '';
    const referenceTable = movementReferenceTables[referenceType];
    if (referenceTable && (!referenceId || !referenceIdSets[referenceTable]?.has(referenceId))) {
      issue({ code: 'ORPHAN_INVENTORY_REFERENCE', table: 'inventory_movements', recordId: String(movement.id), field: 'reference_id', expected: `${referenceType}:${referenceId || '<required>'}`, actual: null, reason: 'Inventory movement reference points to a missing Order or Purchase', severity: 'critical' });
    }
    if (movement.direction === 'sale' && (!referenceType || !referenceId)) {
      issue({ code: 'MISSING_INVENTORY_REFERENCE', table: 'inventory_movements', recordId: String(movement.id), field: 'reference_id', expected: 'reference for sale movement', actual: { referenceType: movement.reference_type, referenceId: movement.reference_id }, reason: 'Sale movement is not traceable to its business operation', severity: 'high' });
    }

    const quantity = Number(movement.quantity);
    const before = Number(movement.quantity_before);
    const after = Number(movement.quantity_after);
    if (!Number.isFinite(quantity) || quantity <= 0) issue({ code: 'INVALID_MOVEMENT_QUANTITY', table: 'inventory_movements', recordId: String(movement.id), field: 'quantity', expected: '> 0', actual: quantity, reason: 'Movement quantity must be positive' });
    if (before < 0 || after < 0) issue({ code: 'NEGATIVE_MOVEMENT_BALANCE', table: 'inventory_movements', recordId: String(movement.id), expected: '>= 0', actual: { before, after }, reason: 'Movement balances cannot be negative' });
    if (movement.direction === 'sale' && !nearlyEqual(after, before - quantity)) issue({ code: 'SALE_MOVEMENT_MISMATCH', table: 'inventory_movements', recordId: String(movement.id), expected: before - quantity, actual: after, reason: 'Sale movement does not reduce stock by its quantity' });
    if (movement.direction === 'purchase' || (movement.direction === 'return' && movement.reference_type !== 'purchase_return')) {
      if (!nearlyEqual(after, before + quantity)) issue({ code: 'INBOUND_MOVEMENT_MISMATCH', table: 'inventory_movements', recordId: String(movement.id), expected: before + quantity, actual: after, reason: 'Inbound movement does not increase stock by its quantity' });
    }
    if (movement.direction === 'return' && movement.reference_type === 'purchase_return' && !nearlyEqual(after, before - quantity)) {
      issue({ code: 'PURCHASE_RETURN_MOVEMENT_MISMATCH', table: 'inventory_movements', recordId: String(movement.id), expected: before - quantity, actual: after, reason: 'Purchase return must reduce stock by its returned quantity', severity: 'critical' });
    }
    if (movement.direction === 'adjustment' && !nearlyEqual(Math.abs(after - before), quantity)) issue({ code: 'ADJUSTMENT_MOVEMENT_MISMATCH', table: 'inventory_movements', recordId: String(movement.id), expected: Math.abs(after - before), actual: quantity, reason: 'Adjustment movement quantity differs from balance delta' });
    if (movement.unit_cost !== null && movement.unit_cost !== undefined) {
      const unitCost = Number(movement.unit_cost);
      const expectedCost = round4(quantity * unitCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) issue({ code: 'INVALID_MOVEMENT_UNIT_COST', table: 'inventory_movements', recordId: String(movement.id), field: 'unit_cost', expected: '>= 0', actual: movement.unit_cost, reason: 'Inventory movement unit cost is invalid', severity: 'critical' });
      if (movement.total_cost !== null && movement.total_cost !== undefined && !nearlyEqual(Number(movement.total_cost), expectedCost)) issue({ code: 'MOVEMENT_TOTAL_COST_MISMATCH', table: 'inventory_movements', recordId: String(movement.id), field: 'total_cost', expected: expectedCost, actual: movement.total_cost, reason: 'Inventory movement total cost is not quantity multiplied by unit cost', severity: 'critical' });
    }
  }

  const movementsById = new Map<string, SqlRow>(movements.map((movement) => [String(movement.id), movement]));
  const movementUsageOwner = new Map<string, string>();
  const usages = db.prepare('SELECT * FROM order_material_usages').all() as SqlRow[];
  for (const usage of usages) {
    const quantity = Number(usage.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) issue({ code: 'INVALID_MATERIAL_USAGE', table: 'order_material_usages', recordId: String(usage.id), field: 'quantity', expected: '> 0', actual: usage.quantity, reason: 'Material usage quantity must be positive' });
    const expectedCost = round2(quantity * Number(usage.unit_cost_at_usage));
    if (!nearlyEqual(Number(usage.total_cost), expectedCost)) issue({ code: 'MATERIAL_COST_MISMATCH', table: 'order_material_usages', recordId: String(usage.id), field: 'total_cost', expected: expectedCost, actual: usage.total_cost, reason: 'Historical material cost is not quantity multiplied by unit cost' });
    const order = ordersById.get(String(usage.order_id));
    if (!order) issue({ code: 'ORPHAN_MATERIAL_USAGE', table: 'order_material_usages', recordId: String(usage.id), expected: usage.order_id, actual: null, reason: 'Material usage references a missing order', severity: 'critical' });
    if (!usage.source_movement_id) {
      if (!order || order.status !== 'cancelled') issue({ code: 'MISSING_SOURCE_MOVEMENT', table: 'order_material_usages', recordId: String(usage.id), field: 'source_movement_id', expected: 'movement id for active usage', actual: null, reason: 'Non-cancelled material usage has no source inventory movement', severity: 'critical' });
      continue;
    }
    const movement = movementsById.get(String(usage.source_movement_id));
    if (!movement) {
      issue({ code: 'MISSING_SOURCE_MOVEMENT', table: 'order_material_usages', recordId: String(usage.id), field: 'source_movement_id', expected: usage.source_movement_id, actual: null, reason: 'Material usage references a missing inventory movement', severity: 'critical' });
      continue;
    }
    const owner = movementUsageOwner.get(String(movement.id));
    if (owner && owner !== String(usage.id)) issue({ code: 'CONFLICTING_SOURCE_MOVEMENT', table: 'order_material_usages', recordId: String(usage.id), field: 'source_movement_id', expected: 'one usage per movement', actual: movement.id, reason: `Inventory movement is already used by material usage ${owner}`, severity: 'high' });
    movementUsageOwner.set(String(movement.id), String(usage.id));
    if (movement.item_type !== usage.item_type || String(movement.item_id) !== String(usage.item_id) || movement.direction !== 'sale' || !nearlyEqual(Number(movement.quantity), quantity) || String(movement.reference_id || '') !== String(usage.order_id)) issue({ code: 'SOURCE_MOVEMENT_MISMATCH', table: 'order_material_usages', recordId: String(usage.id), field: 'source_movement_id', expected: { itemType: usage.item_type, itemId: usage.item_id, direction: 'sale', quantity, orderId: usage.order_id }, actual: movement, reason: 'Source inventory movement does not match material usage', severity: 'critical' });
  }
}
