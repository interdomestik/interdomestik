/**
 * Runs `step` for each item strictly one after another, in iteration order. Each step starts only
 * after the previous one settled, and the first rejection stops the run and is returned.
 */
export async function forEachInOrder<T>(
  items: Iterable<T>,
  step: (item: T) => Promise<void>
): Promise<void> {
  await Array.from(items).reduce<Promise<void>>(
    (previous, item) => previous.then(() => step(item)),
    Promise.resolve()
  );
}
