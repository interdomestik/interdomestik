/**
 * Runs each step strictly after the previous one settles. The gate fixtures depend on that order:
 * foreign-key cleanup, serialized role DDL and single-connection restricted readers.
 */
export function inSequence<T>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>
): Promise<void> {
  return items.reduce<Promise<void>>(
    (previous, item) => previous.then(() => run(item)).then(() => undefined),
    Promise.resolve()
  );
}
