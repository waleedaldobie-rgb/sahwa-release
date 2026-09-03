import {
  AccessoryItem,
  AppData,
  FabricItem,
  InventoryItemType,
  PurchaseLine,
  PurchaseRecord,
  StockMovement,
  CashTransaction
} from '../../types';
import { calculateStockBalance, round2, round4, assertNonNegativeUnitCost, calculateWacAfterInbound, calculateWacAfterOutbound } from '../../domain/inventoryRules';
import { assertValidPaymentMethod } from '../../domain/paymentRules';
import { findById, hasIdOrSourceId } from '../shared/idempotencyRules';
import { createSafeId } from '../../domain/idGenerator';
import { assertCashTransactionContract } from '../../domain/cashRules';

type PurchasePayload = Record<string, any>;
type InventoryMeta = {
  item: FabricItem | AccessoryItem;
  name: string;
  quantity: number;
  unit: string;
  purchasePrice: number;
};

type MovementOptions = {
  unitCost?: number;
  sourceMovementId?: string;
  actorId?: string;
  updateWac?: boolean;
};

export function insertStockMovementInDraft(
  draft: AppData,
  itemType: InventoryItemType,
  itemId: string,
  delta: number,
  direction: StockMovement['direction'],
  reason: string,
  reference?: { type?: string; id?: string; number?: string },
  options: MovementOptions = {}
): StockMovement {
  const meta = getInventoryMeta(draft, itemType, itemId);
  const numericDelta = Number(delta);
  if (!Number.isFinite(numericDelta) || numericDelta === 0) throw new Error('كمية حركة المخزون غير صالحة');
  if (!reason?.trim()) throw new Error('سبب حركة المخزون مطلوب');
  const { before, after } = calculateStockBalance(meta.quantity, numericDelta, meta.name);
  const unitCost = options.unitCost === undefined ? round4(Number(meta.purchasePrice || 0)) : assertNonNegativeUnitCost(options.unitCost);
  const quantity = round4(Math.abs(numericDelta));
  const totalCost = round4(quantity * unitCost);
  const updateWac = options.updateWac === true;
  const wacAfter = options.updateWac
    ? numericDelta > 0
      ? calculateWacAfterInbound(before, Number(meta.purchasePrice || 0), quantity, unitCost)
      : calculateWacAfterOutbound(before, Number(meta.purchasePrice || 0), quantity, unitCost, after)
    : round4(Number(meta.purchasePrice || 0));
  writeQuantity(itemType, meta, after);
  if (updateWac) setPurchasePrice(itemType, meta, wacAfter);
  const movement: StockMovement = {
    id: createSafeId('MOV'),
    itemType,
    itemId,
    itemName: meta.name,
    direction,
    quantity,
    quantityBefore: before,
    quantityAfter: after,
    unit: meta.unit,
    reason: reason.trim(),
    referenceType: reference?.type,
    referenceId: reference?.id,
    referenceNumber: reference?.number,
    unitCost,
    totalCost,
    sourceMovementId: options.sourceMovementId,
    actorId: options.actorId || 'system',
    createdAt: new Date().toISOString()
  };
  draft.stockMovements = [movement, ...(draft.stockMovements || [])];
  return movement;
}

export function returnPurchaseInDraft(
  draft: AppData,
  itemType: InventoryItemType,
  itemId: string,
  quantity: number,
  reason: string,
  originalMovementId?: string,
  purchaseId?: string,
  actorId = 'system'
): StockMovement {
  const original = originalMovementId ? (draft.stockMovements || []).find((movement) => movement.id === originalMovementId) : undefined;
  if (originalMovementId && (!original || original.itemType !== itemType || original.itemId !== itemId || original.direction !== 'purchase')) {
    throw new Error('حركة الشراء الأصلية غير صالحة لإرجاع المخزون');
  }
  const meta = getInventoryMeta(draft, itemType, itemId);
  const unitCost = original?.unitCost === undefined ? round4(Number(meta.purchasePrice || 0)) : assertNonNegativeUnitCost(original.unitCost);
  return insertStockMovementInDraft(draft, itemType, itemId, -Math.abs(Number(quantity)), 'return', reason, { type: 'purchase_return', id: purchaseId || originalMovementId || itemId }, { unitCost, sourceMovementId: originalMovementId, actorId, updateWac: true });
}

export function createPurchaseInDraft(draft: AppData, payload: PurchasePayload): PurchaseRecord {
  const purchaseId = payload.id || createSafeId('PUR');
  const paymentMethod = assertValidPaymentMethod(payload.paymentMethod ?? 'cash');
  const duplicate = findById(draft.purchases, purchaseId);
  if (duplicate) return duplicate;
  if (!payload.supplier?.trim()) throw new Error('اسم المورد مطلوب');
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) throw new Error('أضف صنفاً واحداً على الأقل إلى المشتريات');

  const now = new Date().toISOString();
  const purchaseDate = payload.purchaseDate || now.slice(0, 10);
  const preparedLines: PurchaseLine[] = [];
  let totalAmount = 0;
  for (const input of payload.lines) {
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    if (!input.itemType || !input.itemId || !Number.isFinite(quantity) || quantity <= 0) throw new Error('بيانات كمية المشتريات غير صحيحة');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('سعر الشراء لا يمكن أن يكون سالباً');
    const meta = getInventoryMeta(draft, input.itemType, input.itemId);
    insertStockMovementInDraft(draft, input.itemType, input.itemId, quantity, 'purchase', `شراء من المورد ${payload.supplier.trim()}`, { type: 'purchase', id: purchaseId, number: payload.invoiceNumber || purchaseId }, { unitCost: unitPrice, actorId: 'system', updateWac: true });
    const lineTotal = round2(quantity * unitPrice);
    totalAmount += lineTotal;
    preparedLines.push({ id: createSafeId('PURL'), purchaseId, itemType: input.itemType, itemId: input.itemId, itemName: input.itemName || meta.name, quantity, unit: input.unit || meta.unit, unitPrice, totalAmount: lineTotal, createdAt: now });
  }

  const purchase: PurchaseRecord = {
    id: purchaseId,
    supplier: payload.supplier.trim(),
    invoiceNumber: payload.invoiceNumber || undefined,
    purchaseDate,
    totalAmount: round2(totalAmount),
    paymentMethod,
    notes: payload.notes || undefined,
    status: 'approved',
    lines: preparedLines,
    createdAt: now
  };
  draft.purchases = [purchase, ...(draft.purchases || [])];
  if (totalAmount > 0) {
    insertCashInDraft(draft, {
      id: `CASH-PUR-${purchaseId}`,
      direction: 'out',
      sourceType: 'purchase',
      sourceId: purchaseId,
      referenceNumber: payload.invoiceNumber || purchaseId,
      amount: round2(totalAmount),
      paymentMethod,
      transactionDate: purchaseDate,
      description: `شراء مخزون من ${payload.supplier.trim()}`,
      notes: payload.notes || undefined,
      actorId: 'system',
      reason: payload.notes?.trim() || `شراء مخزون من ${payload.supplier.trim()}`,
      createdAt: now
    });
  }
  return purchase;
}

export function getInventoryMeta(draft: AppData, itemType: InventoryItemType, itemId: string): InventoryMeta {
  if (itemType === 'fabric') {
    const item = draft.fabrics.find((fabric) => fabric.id === itemId);
    if (!item) throw new Error('صنف القماش غير موجود');
    return { item, name: item.name, quantity: item.quantityMeters, unit: 'متر', purchasePrice: item.purchasePrice || 0 };
  }
  const item = draft.accessories.find((accessory) => accessory.id === itemId);
  if (!item) throw new Error('صنف الإكسسوار غير موجود');
  return { item, name: item.name, quantity: item.quantity, unit: item.unit, purchasePrice: item.purchasePrice || 0 };
}

function writeQuantity(itemType: InventoryItemType, meta: InventoryMeta, value: number): void {
  if (itemType === 'fabric') (meta.item as FabricItem).quantityMeters = round4(value);
  else (meta.item as AccessoryItem).quantity = round4(value);
}

function setPurchasePrice(itemType: InventoryItemType, meta: InventoryMeta, value: number): void {
  if (itemType === 'fabric') (meta.item as FabricItem).purchasePrice = round4(value);
  else (meta.item as AccessoryItem).purchasePrice = round4(value);
}

function insertCashInDraft(draft: AppData, transaction: CashTransaction): void {
  assertCashTransactionContract(transaction);
  if (hasIdOrSourceId(draft.cashTransactions, transaction.id, transaction.sourceId)) return;
  draft.cashTransactions = [transaction, ...(draft.cashTransactions || [])];
}
