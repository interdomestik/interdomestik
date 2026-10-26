import { digest } from './db-access-trust.mjs';
import { createIncompleteCollector } from './db-access-incomplete.mjs';

const fail = reason => {
  throw Error('incomplete: M4 emission attribution ' + reason);
};
const shape = (value, names) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === names.split(' ').sort().join('|');
const count = value => Number.isSafeInteger(value) && value > 0;
const add = (a, b) => {
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < 0) fail('multiplicity overflow');
  return sum;
};
// EXACT normalization used by createIncompleteCollector, including undefined/null
// in the array. Do not stringify the reason independently or invent a default.
const diagnosticKey = (file, reason) => JSON.stringify([file, reason]);
const observationFields = [
  'identity',
  'origin',
  'owner',
  'invocation',
  'context',
  'definingContext',
  'outcome',
  'receiver',
  'unsafe',
  'incomplete',
  'indirect',
  'escaped',
  'open',
  'dispatchUnknown',
];
export const m4ObservationKey = row =>
  digest(JSON.stringify(observationFields.map(field => row[field])));
const visitKey = row =>
  JSON.stringify([
    row.origin,
    row.owner,
    row.invocation,
    row.context,
    row.definingContext,
    row.outcome,
    row.escaped,
    row.open,
    row.dispatchUnknown,
  ]);
function record(rows, kind, reason) {
  const first = rows[0];
  return {
    origin: first.origin,
    owner: first.owner,
    invocation: first.invocation,
    context: first.context,
    definingContext: first.definingContext,
    kind,
    reason,
    observationKeys: rows.map(m4ObservationKey).sort(),
  };
}
const emissionKey = row =>
  JSON.stringify({
    origin: row.origin,
    owner: row.owner,
    invocation: row.invocation,
    context: row.context,
    definingContext: row.definingContext,
    kind: row.kind,
    reason: row.reason,
    observationKeys: row.observationKeys,
  });

// Pure additive data; neither this collector nor its output mints authority.
// Actual construction occurs only at the selected graph's original emissions.
export function createM4AttributionCollector() {
  const rows = new Map();
  return {
    add(observations, kind, reason) {
      const value = record(observations, kind, reason),
        key = emissionKey(value);
      const prior = rows.get(key);
      if (prior) prior.occurrences = add(prior.occurrences, 1);
      else rows.set(key, { ...value, occurrences: 1 });
    },
    entries: () => [...rows.values()],
  };
}

// Indices are in EXACTLY the diagnostic array supplied by the caller. This is
// never cached by census/merge: global/adoption/finalization rows arrive later.
// A group can contain several original rows; no per-row causal allocation is made.
export function describeUnattributedDiagnostics(diagnostics, attributions) {
  const groups = new Map();
  for (const [index, row] of diagnostics.entries()) {
    const occurrences = row.occurrences ?? 1;
    if (!count(occurrences)) fail('diagnostic multiplicity');
    const key = diagnosticKey(row.file, row.reason);
    const group = groups.get(key) ?? {
      diagnosticKey: key,
      indices: [],
      occurrences: 0,
      attributedOccurrences: 0,
    };
    group.indices.push(index);
    group.occurrences = add(group.occurrences, occurrences);
    groups.set(key, group);
  }
  // Use the real collector for sidecar compaction, preserving its reason handling.
  const attributed = createIncompleteCollector();
  for (const row of attributions) {
    if (!count(row.occurrences)) fail('attribution multiplicity');
    if (row.kind === 'entry-unsafe') continue;
    attributed.push({
      file: row.origin,
      reason: row.reason,
      occurrences: row.occurrences,
    });
  }
  for (const row of attributed.entries) {
    const group = groups.get(diagnosticKey(row.file, row.reason));
    if (!group || !count(row.occurrences) || row.occurrences > group.occurrences)
      fail('diagnostic emission exceeds original key count');
    group.attributedOccurrences = row.occurrences;
  }
  return [...groups.values()].map(group => ({
    ...group,
    unattributedOccurrences: group.occurrences - group.attributedOccurrences,
  }));
}

function assertDiagnosticCounts(diagnostics, attributions) {
  const claims = createIncompleteCollector(),
    origins = new Set();
  for (const row of attributions) {
    if (row.kind === 'entry-unsafe') continue;
    origins.add(row.origin);
    claims.push({
      file: row.origin,
      reason: row.reason,
      occurrences: row.occurrences,
    });
  }
  if (!origins.size) return;
  const needed = new Map(
    claims.entries.map(row => [
      diagnosticKey(row.file, row.reason),
      { occurrences: row.occurrences, available: 0 },
    ])
  );
  // Scan existing rows once; retain counters only for finite selected emissions.
  // Do not allocate a second complete diagnostic index or remainder array here.
  for (const row of diagnostics) {
    if (!origins.has(row.file)) continue;
    const value = needed.get(diagnosticKey(row.file, row.reason));
    if (!value) continue;
    const occurrences = row.occurrences ?? 1;
    if (!count(occurrences)) fail('diagnostic multiplicity');
    value.available = add(value.available, occurrences);
  }
  for (const value of needed.values())
    if (!count(value.occurrences) || value.occurrences > value.available)
      fail('diagnostic emission exceeds original key count');
}

// Called only after the existing wire has validated every observation locator,
// inventory verdict, frame, source bookend and root partition. No caller selection.
export function validateM4Attributions(batch, entries, result) {
  if (!Array.isArray(batch.attributions)) fail('missing sidecar');
  if (!Array.isArray(result.incomplete) || !Array.isArray(result.failures))
    fail('original emission arrays');
  const expected = new Map(),
    visits = new Map(),
    observations = new Map();
  const expect = (rows, kind, reason, occurrences) => {
    const value = record(rows, kind, reason),
      key = emissionKey(value);
    if (expected.has(key)) fail('duplicate expected emission');
    expected.set(key, { ...value, occurrences });
  };
  for (const row of batch.observations) {
    const key = m4ObservationKey(row),
      entry = entries.get(row.identity);
    if (observations.has(key) || !entry) fail('duplicate/foreign observation');
    observations.set(key, row);
    if (row.outcome === 'visited') {
      if (entry._incomplete) expect([row], 'entry-incomplete', entry.reason, row.occurrences);
      else if (row.unsafe)
        expect(
          [row],
          'entry-unsafe',
          entry.reason ?? 'changed executable edge reaches ambient operation',
          row.occurrences
        );
    } else if (row.outcome === 'recursion' || row.outcome === 'graph-bound') {
      const key = visitKey(row),
        group = visits.get(key) ?? [];
      group.push(row);
      visits.set(key, group);
    }
  }
  for (const rows of visits.values()) {
    const first = rows[0];
    if (rows.some(row => row.occurrences !== first.occurrences))
      fail('owner visit multiplicity differs across identities');
    const recursive = first.outcome === 'recursion';
    expect(
      rows,
      recursive ? 'owner-recursion' : 'owner-bound',
      recursive ? 'recursive executable edge' : 'graph bound exceeded',
      first.occurrences
    );
  }
  const seen = new Set(),
    failureClaims = new Map(),
    claimedIdentities = new Set();
  for (const row of batch.attributions) {
    if (
      !shape(
        row,
        'origin owner invocation context definingContext kind reason observationKeys occurrences'
      ) ||
      !count(row.occurrences) ||
      !Array.isArray(row.observationKeys)
    )
      fail('emission shape');
    const key = emissionKey(row),
      wanted = expected.get(key);
    if (!wanted || seen.has(key) || row.occurrences !== wanted.occurrences)
      fail('missing/replayed/foreign selected emission');
    seen.add(key);
    if (row.kind === 'entry-unsafe') {
      const observation = observations.get(row.observationKeys[0]);
      claimedIdentities.add(observation.identity);
      const key = JSON.stringify([observation.identity, row.origin, row.reason]);
      failureClaims.set(key, add(failureClaims.get(key) ?? 0, row.occurrences));
    }
  }
  if (seen.size !== expected.size) fail('omitted selected emission');
  assertDiagnosticCounts(result.incomplete, batch.attributions);
  // Count ORIGINAL graph failure emissions, never native.raw identity-deduped rows.
  if (!claimedIdentities.size) return;
  const failures = new Map();
  for (const row of result.failures) {
    if (!claimedIdentities.has(row.identity)) continue;
    const key = JSON.stringify([row.identity, row.mountedFrom, row.reason]);
    if (failureClaims.has(key)) failures.set(key, add(failures.get(key) ?? 0, 1));
  }
  for (const [key, occurrences] of failureClaims)
    if (occurrences > (failures.get(key) ?? 0)) fail('failure emission exceeds original rows');
}
