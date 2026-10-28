import { M4_PATH_LIMITS } from './db-access-m4-path-limits.mjs';

export const pathFail = reason => {
  throw Error('incomplete: M4 selected path ' + reason);
};
export function pathCount(a, b) {
  if (!Number.isSafeInteger(b) || b < 0 || !Number.isSafeInteger(a + b))
    pathFail('invalid/overflowed count');
  return a + b;
}
export function createM4PathBudget() {
  let encodedBytes = 0;
  const counts = { scopes: 0, records: 0, metadata: 0 };
  return {
    charge(kind, encoded) {
      if (!Object.hasOwn(counts, kind)) pathFail('unknown storage class');
      const bytes = pathCount(encodedBytes, Buffer.byteLength(encoded, 'utf8'));
      if (bytes > M4_PATH_LIMITS.encodedBytes || counts[kind] >= M4_PATH_LIMITS[kind])
        pathFail('observer storage ceiling');
      encodedBytes = bytes;
      counts[kind]++;
    },
    snapshot: () => ({ encodedBytes, ...counts }),
  };
}

export function createM4PathStorage() {
  const budget = createM4PathBudget(),
    selections = [],
    scopes = [],
    records = [];
  const selectionIndex = new Map(),
    scopeIndex = new Map(),
    recordIndex = new Map();
  let selectedOccurrences = 0,
    overlapOccurrences = 0;
  function intern(table, index, value, kind, prefix) {
    const key = JSON.stringify(value);
    if (index.has(key)) return index.get(key);
    const id = prefix + table.length;
    budget.charge(kind, JSON.stringify({ id, ...value }));
    table.push({ id, ...value });
    index.set(key, id);
    return id;
  }
  return {
    budget,
    selection(keys) {
      return intern(
        selections,
        selectionIndex,
        { observationKeys: [...new Set(keys)].sort() },
        'metadata',
        'selection:'
      );
    },
    scope(value) {
      return intern(scopes, scopeIndex, value, 'scopes', 'scope:');
    },
    append({ scopeId, diagnosticKey, occurrences, legacyDiagnosticKey }) {
      const key = JSON.stringify([scopeId, diagnosticKey, legacyDiagnosticKey]);
      const previous = recordIndex.get(key);
      if (previous) previous.occurrences = pathCount(previous.occurrences, occurrences);
      else {
        const row = { scopeId, diagnosticKey, legacyDiagnosticKey, occurrences };
        // Reserve the maximum safe integer width, including later count growth.
        budget.charge('records', JSON.stringify({ ...row, occurrences: Number.MAX_SAFE_INTEGER }));
        records.push(row);
        recordIndex.set(key, row);
      }
      selectedOccurrences = pathCount(selectedOccurrences, occurrences);
      if (legacyDiagnosticKey !== null)
        overlapOccurrences = pathCount(overlapOccurrences, occurrences);
    },
    output() {
      return {
        selections,
        scopes,
        records,
        selectedOccurrences,
        overlapOccurrences,
        storage: budget.snapshot(),
      };
    },
  };
}
