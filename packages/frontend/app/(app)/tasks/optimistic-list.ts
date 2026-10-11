/** Restore only this failed deletion, preserving unrelated edits, inserts and
 * successful deletions. Original surviving neighbours retain the row's order. */
export function restoreRemovedItems<T extends { id: string }>(
  current: readonly T[],
  snapshot: readonly T[],
  removedIds: ReadonlySet<string>
): T[] {
  const result = [...current];
  for (let index = 0; index < snapshot.length; index++) {
    const item = snapshot[index];
    if (!removedIds.has(item.id) || result.some((row) => row.id === item.id)) continue;
    const next = snapshot
      .slice(index + 1)
      .find((row) => result.some((entry) => entry.id === row.id));
    if (next)
      result.splice(
        result.findIndex((row) => row.id === next.id),
        0,
        item
      );
    else {
      const previous = snapshot
        .slice(0, index)
        .reverse()
        .find((row) => result.some((entry) => entry.id === row.id));
      const position = previous ? result.findIndex((row) => row.id === previous.id) + 1 : 0;
      result.splice(position, 0, item);
    }
  }
  return result;
}
