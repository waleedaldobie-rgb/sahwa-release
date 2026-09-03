const MAX_CACHE_ENTRIES = 24;
const cache = new Map<string, unknown>();

export function getCachedDerivedValue<T>(key: string, compute: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const value = compute();
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  return value;
}

export function invalidateDerivedCache(prefixes?: readonly string[]): void {
  if (!prefixes || prefixes.length === 0) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) cache.delete(key);
  }
}

export function getDerivedCacheSize(): number {
  return cache.size;
}
