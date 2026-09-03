export function findById<T extends { id?: string }>(items: T[] | undefined, id: string): T | undefined {
  return (items || []).find((item) => item.id === id);
}

export function hasSourceId<T extends { sourceId?: string }>(items: T[] | undefined, sourceId: string): boolean {
  return (items || []).some((item) => item.sourceId === sourceId);
}

export function hasIdOrSourceId<T extends { id?: string; sourceId?: string }>(items: T[] | undefined, id: string, sourceId?: string): boolean {
  return Boolean(findById(items, id) || (sourceId && hasSourceId(items, sourceId)));
}
