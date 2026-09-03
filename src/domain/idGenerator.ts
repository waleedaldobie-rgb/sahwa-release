const fallbackRandom = () => Math.random().toString(36).slice(2, 12);

export function createSafeId(prefix: string): string {
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${fallbackRandom()}-${fallbackRandom()}`;
  return `${prefix}-${uuid}`;
}
