export const round2 = (value: number): number => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const round4 = (value: number): number => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

export const calculateStockBalance = (beforeValue: number, deltaValue: number, itemName: string) => {
  const before = round4(beforeValue);
  const delta = round4(deltaValue);
  const after = round4(before + delta);
  if (after < -0.0001) {
    throw new Error(`لا يمكن تنفيذ الحركة؛ الكمية المتاحة من ${itemName} غير كافية.`);
  }
  return { before, after: Math.max(0, after) };
};

export function assertPositiveInventoryQuantity(value: unknown, label = 'كمية المخزون'): number {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`${label} يجب أن تكون موجبة`);
  return round4(quantity);
}

export function assertNonNegativeUnitCost(value: unknown, label = 'تكلفة الوحدة'): number {
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) throw new Error(`${label} غير صالحة`);
  return round4(cost);
}

export function calculateWacAfterInbound(
  quantityBefore: number,
  wacBefore: number,
  inboundQuantity: number,
  inboundUnitCost: number
): number {
  const before = round4(quantityBefore);
  const oldWac = round4(wacBefore);
  const quantity = assertPositiveInventoryQuantity(inboundQuantity, 'كمية الإدخال');
  const unitCost = assertNonNegativeUnitCost(inboundUnitCost);
  if (before <= 0) return unitCost;
  return round4(((before * oldWac) + (quantity * unitCost)) / (before + quantity));
}

export function calculateWacAfterOutbound(
  quantityBefore: number,
  wacBefore: number,
  outboundQuantity: number,
  outboundUnitCost: number,
  quantityAfter: number
): number {
  const before = round4(quantityBefore);
  const oldWac = round4(wacBefore);
  const quantity = assertPositiveInventoryQuantity(outboundQuantity, 'كمية الإخراج');
  const unitCost = assertNonNegativeUnitCost(outboundUnitCost);
  const after = round4(quantityAfter);
  if (after <= 0) return 0;
  return round4(Math.max(0, ((before * oldWac) - (quantity * unitCost)) / after));
}

export function resolveReturnUnitCost(originalUnitCost: unknown, currentWac: unknown): number {
  const original = Number(originalUnitCost);
  if (Number.isFinite(original) && original >= 0) return round4(original);
  return assertNonNegativeUnitCost(currentWac, 'WAC الحالي');
}
