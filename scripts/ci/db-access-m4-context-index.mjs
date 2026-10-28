const fail = reason => {
  throw Error('incomplete: M4 context inspection ' + reason);
};
const array = value => {
  if (!Array.isArray(value)) fail('missing original array');
  return value;
};
const add = (a, b) => {
  if (!Number.isSafeInteger(b) || b < 0 || !Number.isSafeInteger(a + b)) fail('invalid count');
  return a + b;
};
const occurrences = row => {
  const n = row.occurrences ?? 1;
  if (!Number.isSafeInteger(n) || n < 1) fail('invalid multiplicity');
  return n;
};
// Identical to the original collector, including undefined/null array normalization.
const diagnosticKey = row => JSON.stringify([row.file, row.reason]);
const failureKey = row => JSON.stringify([row.identity, row.mountedFrom, row.reason]);
const range = (path, rows) => ({ path, start: 0, endExclusive: array(rows).length });

export function inspectM4ContextNamespace(rows, path, claims, failure, anchor) {
  array(rows);
  const groups = new Map(
    [...claims].map(([key, claim]) => [
      key,
      {
        ...claim,
        indices: [],
        originalOccurrences: 0,
      },
    ])
  );
  // Source file/identity fields are strings in genuine native rows. Keep the
  // original JSON normalization for non-string fixture values as well.
  const relevant = new Set([...claims.keys()].map(key => JSON.parse(key)[0]));
  let total = 0,
    matchedRows = 0,
    matchedOccurrences = 0;
  for (const [index, row] of rows.entries()) {
    const n = failure ? 1 : occurrences(row);
    total = add(total, n);
    // Always count every original row, including when there are no claims.
    // Only selected origins/identities need the potentially long reason key.
    if (!groups.size) continue;
    const field = failure ? row.identity : row.file;
    if (typeof field === 'string' && !relevant.has(field)) continue;
    const group = groups.get(failure ? failureKey(row) : diagnosticKey(row));
    if (!group) continue;
    group.indices.push(index);
    group.originalOccurrences = add(group.originalOccurrences, n);
    matchedRows++;
    matchedOccurrences = add(matchedOccurrences, n);
  }
  let claimed = 0,
    unresolved = false;
  for (const group of groups.values()) {
    claimed = add(claimed, group.claimedOccurrences);
    const missing = group.indices.length === 0;
    const short = group.originalOccurrences < group.claimedOccurrences;
    group.resolution = missing
      ? 'missing-key'
      : short
        ? 'insufficient-occurrences'
        : 'matched-key-group';
    if (missing || short) {
      if (anchor) fail('missing/overclaimed original emission at ' + path);
      unresolved = true;
      group.residualOccurrences = null;
    } else group.residualOccurrences = group.originalOccurrences - group.claimedOccurrences;
  }
  return {
    original: range(path, rows),
    relation: anchor ? 'selected-emission-key-group' : 'cross-namespace-key-reference',
    groups: [...groups.values()],
    totals: {
      originalRows: rows.length,
      originalOccurrences: total,
      matchedKeyRows: matchedRows,
      matchedKeyOccurrences: matchedOccurrences,
      unmatchedRows: rows.length - matchedRows,
      unmatchedOccurrences: total - matchedOccurrences,
      claimedOccurrences: claimed,
      unattributedOccurrences: unresolved ? null : total - claimed,
    },
    resolution: unresolved ? 'unresolved-namespace-links' : 'key-groups-resolved',
    unmatchedIndexDefinition: 'original [start,endExclusive) minus all listed group.indices',
    allocation: 'Group totals only; no claim is allocated to an individual original row.',
  };
}
