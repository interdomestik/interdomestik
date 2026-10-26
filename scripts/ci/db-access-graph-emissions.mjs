import { isUnsafe } from './db-access-inventory.mjs';

// Preserve original entry order and emissions; selected attribution is additive only.
export function createGraphEntryEmitter(entries, census) {
  const byOwner = new Map();
  for (const entry of entries) {
    const list = byOwner.get(entry._owner) ?? [];
    list.push(entry);
    byOwner.set(entry._owner, list);
  }
  return (owner, origin, { failures, incomplete }, observed) => {
    for (const entry of byOwner.get(owner) ?? []) {
      if (entry._incomplete) {
        incomplete.push({ file: origin, reason: entry.reason });
        census?.attribute(observed, 'entry-incomplete', entry.reason, entry);
      } else if (isUnsafe(entry)) {
        failures.push({
          ...entry,
          mountedFrom: origin,
          reason: entry.reason ?? 'changed executable edge reaches ambient operation',
        });
        census?.attribute(
          observed,
          'entry-unsafe',
          entry.reason ?? 'changed executable edge reaches ambient operation',
          entry
        );
      }
    }
  };
}
