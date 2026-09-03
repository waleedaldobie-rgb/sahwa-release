import { describe, expect, it } from 'vitest';
import { ALL_DATA_SLICES, INITIAL_DATA_REVISION, bumpDataRevision } from '../state/appDataStore';
import { getCachedDerivedValue, getDerivedCacheSize, invalidateDerivedCache } from '../services/derivedDataCache';

describe('partial refresh revisions and derived cache', () => {
  it('bumps only the relevant revision groups while always bumping global', () => {
    const next = bumpDataRevision(INITIAL_DATA_REVISION, ['expenses', 'cashTransactions']);
    expect(next.global).toBe(1);
    expect(next.accounting).toBe(1);
    expect(next.inventory).toBe(0);
    expect(next.orders).toBe(0);
    expect(next.customers).toBe(0);

    const inventoryNext = bumpDataRevision(next, ['fabrics', 'stockMovements']);
    expect(inventoryNext.global).toBe(2);
    expect(inventoryNext.inventory).toBe(1);
    expect(inventoryNext.accounting).toBe(1);
  });

  it('supports global refresh revision invalidation', () => {
    const next = bumpDataRevision(INITIAL_DATA_REVISION, ALL_DATA_SLICES);
    expect(next.global).toBe(1);
    expect(next.orders).toBe(1);
    expect(next.inventory).toBe(1);
    expect(next.accounting).toBe(1);
    expect(next.customers).toBe(1);
  });

  it('memoizes values by key and invalidates by prefix', () => {
    invalidateDerivedCache();
    let computations = 0;
    const compute = () => {
      computations += 1;
      return { value: computations };
    };

    expect(getCachedDerivedValue('reports:1', compute).value).toBe(1);
    expect(getCachedDerivedValue('reports:1', compute).value).toBe(1);
    expect(computations).toBe(1);
    expect(getDerivedCacheSize()).toBe(1);

    invalidateDerivedCache(['reports:']);
    expect(getCachedDerivedValue('reports:1', compute).value).toBe(2);
    expect(computations).toBe(2);
  });
});
