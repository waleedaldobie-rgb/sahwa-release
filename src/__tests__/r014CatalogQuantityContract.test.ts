import { describe, expect, it } from 'vitest';
import { AppData } from '../types';
import { updateAccessoryInDraft, updateFabricInDraft } from '../services/adapters/inventoryCatalogDraftAdapter';
import { insertStockMovementInDraft } from '../services/adapters/inventoryMovementDraftAdapter';

function makeData(): AppData {
  return {
    customers: [], orders: [], invoices: [], fabrics: [{ id: 'R014-FABRIC', name: 'قماش', color: 'أبيض', colorHex: '#fff', purchasePrice: 10, sellingPrice: 20, quantityMeters: 50, minStockMeters: 2 }],
    accessories: [{ id: 'R014-ACCESSORY', name: 'زر', category: 'إكسسوار', purchasePrice: 2, sellingPrice: 4, quantity: 25, minStock: 1, unit: 'حبة' }],
    thobeTypes: [], colors: [], stockMovements: [], purchases: [], expenses: [], cashTransactions: [], orderMaterialUsages: [], orderEvents: [], notifications: []
  };
}

describe('R-014 Mock catalog quantity contract', () => {
  it('preserves fabric and accessory quantity during catalog metadata updates', () => {
    const draft = makeData();
    updateFabricInDraft(draft, { ...draft.fabrics[0], quantityMeters: 999, sellingPrice: 22 });
    updateAccessoryInDraft(draft, { ...draft.accessories[0], quantity: 999, sellingPrice: 5 });

    expect(draft.fabrics[0].quantityMeters).toBe(50);
    expect(draft.accessories[0].quantity).toBe(25);
    expect(draft.stockMovements).toHaveLength(0);
  });

  it('changes quantity only through the official stock movement path', () => {
    const draft = makeData();
    insertStockMovementInDraft(draft, 'fabric', 'R014-FABRIC', -3, 'adjustment', 'R014 adjustment', { type: 'manual', id: 'R014-ADJ-F' });
    insertStockMovementInDraft(draft, 'accessory', 'R014-ACCESSORY', 4, 'adjustment', 'R014 adjustment', { type: 'manual', id: 'R014-ADJ-A' });

    expect(draft.fabrics[0].quantityMeters).toBe(47);
    expect(draft.accessories[0].quantity).toBe(29);
    expect(draft.stockMovements).toHaveLength(2);
    expect(draft.stockMovements.every((movement) => movement.referenceType === 'manual')).toBe(true);
  });
});
