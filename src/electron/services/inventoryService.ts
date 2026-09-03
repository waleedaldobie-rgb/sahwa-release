import { InventoryItemType, StockMovement } from '../../types';
import { InventoryMeta, InventoryRepository } from '../repositories/inventoryRepository';
import { calculateStockBalance, round4, assertNonNegativeUnitCost, assertPositiveInventoryQuantity, calculateWacAfterInbound, calculateWacAfterOutbound, resolveReturnUnitCost } from '../../domain/inventoryRules';
import { createSafeId } from '../../domain/idGenerator';

export interface InventoryMovementOptions {
  unitCost?: number;
  sourceMovementId?: string;
  actorId?: string;
  updateWac?: boolean;
}

export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly db: { transaction<T>(callback: () => T): () => T }
  ) {}

  getMeta(itemType: InventoryItemType, itemId: string): InventoryMeta {
    return this.repository.getMeta(itemType, itemId);
  }

  listMovements(itemType?: InventoryItemType, itemId?: string): StockMovement[] {
    return this.repository.listMovements(itemType, itemId).map((row: any) => ({
      id: row.id,
      itemType: row.item_type,
      itemId: row.item_id,
      itemName: row.item_name,
      direction: row.direction,
      quantity: row.quantity,
      quantityBefore: row.quantity_before,
      quantityAfter: row.quantity_after,
      unit: row.unit,
      reason: row.reason,
      referenceType: row.reference_type || undefined,
      referenceId: row.reference_id || undefined,
      referenceNumber: row.reference_number || undefined,
      unitCost: row.unit_cost === null || row.unit_cost === undefined ? undefined : round4(row.unit_cost),
      totalCost: row.total_cost === null || row.total_cost === undefined ? undefined : round4(row.total_cost),
      sourceMovementId: row.source_movement_id || undefined,
      actorId: row.actor_id || undefined,
      createdAt: row.created_at
    }));
  }

  adjustStock(
    itemType: InventoryItemType,
    itemId: string,
    quantity: number,
    reason: string,
    direction: 'adjustment' | 'return' | 'adjustment_in' | 'adjustment_out' = 'adjustment',
    actorId = 'system',
    unitCost?: number
  ): StockMovement {
    if (!reason || !reason.trim()) throw new Error('سبب التسوية مطلوب');
    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity === 0) throw new Error('كمية التسوية يجب أن تكون رقماً غير صفري');
    if (direction !== 'adjustment' && numericQuantity < 0) throw new Error('كمية الحركة لا يمكن أن تكون سالبة');
    if (direction === 'adjustment_in') assertNonNegativeUnitCost(unitCost, 'تكلفة adjustment_in');
    const delta = direction === 'return' || direction === 'adjustment_in'
      ? Math.abs(numericQuantity)
      : direction === 'adjustment_out'
        ? -Math.abs(numericQuantity)
        : numericQuantity;
    const movementDirection: StockMovement['direction'] = direction === 'return' ? 'return' : 'adjustment';
    return this.recordMovement(itemType, itemId, delta, movementDirection, reason.trim(), { type: 'stock_adjustment', id: itemId }, {
      unitCost: unitCost === undefined ? undefined : assertNonNegativeUnitCost(unitCost),
      actorId,
      updateWac: direction === 'adjustment_in'
    });
  }

  returnPurchase(
    itemType: InventoryItemType,
    itemId: string,
    quantity: number,
    reason: string,
    originalMovementId?: string,
    purchaseId?: string,
    actorId = 'system'
  ): StockMovement {
    const returnQuantity = assertPositiveInventoryQuantity(quantity, 'كمية إرجاع الشراء');
    if (!reason?.trim()) throw new Error('سبب إرجاع الشراء مطلوب');
    const original = originalMovementId ? this.repository.findMovement(originalMovementId) : undefined;
    if (originalMovementId && (!original || original.item_type !== itemType || original.item_id !== itemId || original.direction !== 'purchase')) {
      throw new Error('حركة الشراء الأصلية غير صالحة لإرجاع المخزون');
    }
    const meta = this.repository.getMeta(itemType, itemId);
    const unitCost = resolveReturnUnitCost(original?.unit_cost, meta.purchasePrice);
    return this.recordMovement(itemType, itemId, -returnQuantity, 'return', reason.trim(), {
      type: 'purchase_return', id: purchaseId || originalMovementId || itemId
    }, { unitCost, sourceMovementId: originalMovementId, actorId, updateWac: true });
  }

  recordMovement(
    itemType: InventoryItemType,
    itemId: string,
    delta: number,
    direction: StockMovement['direction'],
    reason: string,
    reference?: { type?: string; id?: string; number?: string },
    options: InventoryMovementOptions = {}
  ): StockMovement {
    const run = this.db.transaction(() => {
      const meta = this.repository.getMeta(itemType, itemId);
      const numericDelta = Number(delta);
      if (!Number.isFinite(numericDelta) || numericDelta === 0) throw new Error('كمية حركة المخزون غير صالحة');
      if (!reason?.trim()) throw new Error('سبب حركة المخزون مطلوب');
      const { before, after: safeAfter } = calculateStockBalance(meta.quantity, numericDelta, meta.name);
      const quantity = round4(Math.abs(numericDelta));
      const unitCost = options.unitCost === undefined ? round4(Number(meta.purchasePrice || 0)) : assertNonNegativeUnitCost(options.unitCost);
      const totalCost = round4(quantity * unitCost);
      const updateWac = options.updateWac === true;
      const wacAfter = options.updateWac
        ? numericDelta > 0
          ? calculateWacAfterInbound(before, Number(meta.purchasePrice || 0), quantity, unitCost)
          : calculateWacAfterOutbound(before, Number(meta.purchasePrice || 0), quantity, unitCost, safeAfter)
        : round4(Number(meta.purchasePrice || 0));
      const id = createSafeId('MOV');
      const createdAt = new Date().toISOString();
      this.repository.updateQuantity(meta, safeAfter, itemId);
      if (updateWac) this.repository.updateWac(meta, wacAfter, itemId);
      this.repository.insertMovement({
        id,
        itemType,
        itemId,
        itemName: meta.name,
        direction,
        quantity,
        quantityBefore: before,
        quantityAfter: safeAfter,
        unit: meta.unit,
        reason: reason.trim(),
        referenceType: reference?.type,
        referenceId: reference?.id,
        referenceNumber: reference?.number,
        unitCost,
        totalCost,
        sourceMovementId: options.sourceMovementId,
        actorId: options.actorId || 'system',
        createdAt
      });
      return {
        id,
        itemType,
        itemId,
        itemName: meta.name,
        direction,
        quantity,
        quantityBefore: before,
        quantityAfter: safeAfter,
        unit: meta.unit,
        reason: reason.trim(),
        referenceType: reference?.type,
        referenceId: reference?.id,
        referenceNumber: reference?.number,
        unitCost,
        totalCost,
        sourceMovementId: options.sourceMovementId,
        actorId: options.actorId || 'system',
        createdAt
      };
    });
    return run();
  }
}
