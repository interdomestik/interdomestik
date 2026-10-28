import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = reason => {
  throw new Error('incomplete: operation lineage ' + reason);
};

function indexOperations(report) {
  if (
    report.baselineCount !== 604 ||
    !/^[a-f0-9]{64}$/u.test(report.historicalBaselineSha256 ?? '') ||
    !Array.isArray(report.newEntries) ||
    report.newCount !== report.newEntries.length ||
    !Array.isArray(report.failingNewEntries) ||
    report.failingNewCount !== report.failingNewEntries.length
  )
    fail('incomplete inventory or baseline');
  const inventory = new Map();
  for (const entry of report.newEntries) {
    if (!/^[a-f0-9]{64}$/u.test(entry.identity ?? '')) fail('invalid identity');
    // The native inventory can contain several call nodes with the same canonical
    // identity (e.g. chained methods on one line). Never erase those raw records.
    const entries = inventory.get(entry.identity) ?? [];
    entries.push(entry);
    inventory.set(entry.identity, entries);
  }
  const failures = new Set();
  for (const entry of report.failingNewEntries) {
    if (!/^[a-f0-9]{64}$/u.test(entry.identity ?? '') || failures.has(entry.identity))
      fail('invalid or duplicate failure');
    failures.add(entry.identity);
  }
  // Changed dependency mounts can invalidate a preserved operation that is not
  // itself listed in newEntries. Retain this independent native failure surface.
  const observed = new Set([...inventory.keys(), ...failures]);
  return { inventory, failures, observed };
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, ordered(value[key])])
    );
  return value;
}

function diagnosticIndex(rows, inventory = false) {
  if (!Array.isArray(rows)) fail('missing raw diagnostic rows');
  const index = new Map();
  rows.forEach((row, position) => {
    if (
      !inventory &&
      (typeof row.file !== 'string' ||
        typeof row.reason !== 'string' ||
        !Number.isSafeInteger(row.occurrences) ||
        row.occurrences < 1)
    )
      fail('invalid diagnostic occurrence');
    // Bind every field, not just its reason prefix. Preserve identical repeated
    // records as separate raw indices, in addition to each record's occurrences.
    const key = JSON.stringify(ordered(row));
    const entry = index.get(key) ?? { raw: row, rawIndices: [] };
    entry.rawIndices.push(position);
    index.set(key, entry);
  });
  return index;
}

function compareDiagnostics(before, after, inventory = false) {
  const oldRows = diagnosticIndex(before, inventory),
    newRows = diagnosticIndex(after, inventory);
  const changed = [];
  for (const key of new Set([...oldRows.keys(), ...newRows.keys()])) {
    const old = oldRows.get(key),
      next = newRows.get(key);
    if (old?.rawIndices.length === next?.rawIndices.length) continue;
    changed.push({
      raw: (old ?? next).raw,
      beforeIndices: old?.rawIndices ?? [],
      afterIndices: next?.rawIndices ?? [],
    });
  }
  return {
    beforeRows: before.length,
    afterRows: after.length,
    ...(!inventory
      ? {
          beforeOccurrences: before.reduce((sum, row) => sum + row.occurrences, 0),
          afterOccurrences: after.reduce((sum, row) => sum + row.occurrences, 0),
        }
      : {}),
    changed,
  };
}

/**
 * Diagnostic accounting of independently retained native reports. A disappeared
 * identity is not proof of discharge: replacement/relocation still needs its
 * actual source/effect/context correspondence and protected producer join.
 */
export function compareOperationBoundaryLineage(before, after) {
  const old = indexOperations(before),
    next = indexOperations(after);
  if (
    before.historicalBaselineSha256 !== after.historicalBaselineSha256 ||
    before.trustedCommit !== after.trustedCommit ||
    before.trustedTree !== after.trustedTree
  )
    fail('adoption or baseline changed');
  const sorted = iterable => [...iterable].sort();
  return {
    beforeReportSha256: digest(before),
    afterReportSha256: digest(after),
    retainedIdentities: sorted([...old.observed].filter(id => next.observed.has(id))),
    introducedIdentities: sorted([...next.observed].filter(id => !old.observed.has(id))),
    disappearedIdentitiesRequiringCorrespondence: sorted(
      [...old.observed].filter(id => !next.observed.has(id))
    ),
    noLongerFailingIdentitiesRequiringProof: sorted(
      [...old.failures].filter(id => !next.failures.has(id))
    ),
    newlyFailingIdentities: sorted([...next.failures].filter(id => !old.failures.has(id))),
    rawInventory: compareDiagnostics(before.newEntries, after.newEntries, true),
    rawFailures: compareDiagnostics(before.failingNewEntries, after.failingNewEntries, true),
    rawDiagnostics: compareDiagnostics(before.incomplete, after.incomplete),
    unresolvedDiagnostics: compareDiagnostics(
      before.unresolvedIncomplete,
      after.unresolvedIncomplete
    ),
    runtimeAdmission: false,
    acceptedNewIdentities: 0,
    qualification:
      'Reported inventory plus independently remounted failures; raw rows retained. Counter changes only; neither disappearance nor replacement is accepted proof.',
  };
}
