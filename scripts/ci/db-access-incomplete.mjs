// Same [file, reason] key and first-occurrence order as the report's former final compaction.
// Collect while emitting: memory follows distinct diagnostics, while raw multiplicity survives.
export function createIncompleteCollector() {
  const entries = [];
  const firstByKey = new Map();
  let rawCount = 0;
  return {
    entries,
    push(...items) {
      for (const item of items) {
        const occurrences = item.occurrences ?? 1;
        rawCount += occurrences;
        const key = JSON.stringify([item.file, item.reason]);
        const prior = firstByKey.get(key);
        if (prior) prior.occurrences += occurrences;
        else {
          const first = { ...item, occurrences };
          firstByKey.set(key, first);
          entries.push(first);
        }
      }
    },
    get rawCount() {
      return rawCount;
    },
  };
}
