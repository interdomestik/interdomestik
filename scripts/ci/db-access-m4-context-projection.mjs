import { inspectM4ContextNamespace as inspectNamespace } from './db-access-m4-context-index.mjs';
import { describeM4SelectedPathInspection } from './db-access-m4-path-projection.mjs';
import { m4ObservationKey } from './db-access-m4-context-attribution.mjs';

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

function selectedClaims(census) {
  const selected = new Set(array(census.selectedIdentities));
  const keys = [],
    observations = new Map(),
    diagnostics = new Map(),
    failures = new Map();
  const observedIdentities = new Set();
  let contextOccurrences = 0;
  for (const row of array(census.observations)) {
    const key = m4ObservationKey(row);
    if (!selected.has(row.identity) || observations.has(key)) fail('foreign/duplicate observation');
    observations.set(key, row);
    observedIdentities.add(row.identity);
    contextOccurrences = add(contextOccurrences, occurrences(row));
    keys.push(key);
  }
  for (const [index, row] of array(census.attributions).entries()) {
    const refs = array(row.observationKeys).map(key => observations.get(key));
    if (!refs.length || refs.some(value => !value)) fail('missing observation reference');
    const unsafe = row.kind === 'entry-unsafe';
    if (!unsafe && !['entry-incomplete', 'owner-recursion', 'owner-bound'].includes(row.kind))
      fail('unknown emission kind');
    if (unsafe && refs.length !== 1) fail('unsafe identity ambiguity');
    const key = unsafe
      ? failureKey({ identity: refs[0].identity, mountedFrom: row.origin, reason: row.reason })
      : diagnosticKey({ file: row.origin, reason: row.reason });
    const target = unsafe ? failures : diagnostics;
    const claim = target.get(key) ?? { key, attributionIndices: [], claimedOccurrences: 0 };
    claim.attributionIndices.push(index);
    claim.claimedOccurrences = add(claim.claimedOccurrences, occurrences(row));
    target.set(key, claim);
  }
  return {
    keys,
    diagnostics,
    failures,
    contextOccurrences,
    unobservedSelectedIdentities: census.selectedIdentities.filter(
      id => !observedIdentities.has(id)
    ),
  };
}

// One scan per original namespace; only claimed keys retain row indices. All other
// rows remain in the original range, represented by totals rather than an O(N) copy.
// Pure diagnostic data, never an authentication or admission API. The sole proposed
// call site uses the native view already validated by linkM4EffectAssertions.
export function describeM4ContextInspection(native, nativeOutputDigest, runtime) {
  const census = native.rawGraph?.m4Contexts;
  if (
    !census ||
    !native.eventBinding ||
    typeof nativeOutputDigest !== 'string' ||
    typeof native.sourcePolicyDigest !== 'string' ||
    typeof runtime.contextSha256 !== 'string' ||
    typeof runtime.policySha256 !== 'string'
  )
    fail('missing binding data');
  const claims = selectedClaims(census);
  const graphDiagnostics = inspectNamespace(
    native.rawGraph.incomplete,
    '/rawGraph/incomplete',
    claims.diagnostics,
    false,
    true
  );
  const rawDiagnostics = inspectNamespace(
    native.raw?.diagnostics,
    '/raw/diagnostics',
    claims.diagnostics,
    false,
    false
  );
  const reportDiagnostics = inspectNamespace(
    native.report?.incomplete,
    '/report/incomplete',
    claims.diagnostics,
    false,
    false
  );
  const graphFailures = inspectNamespace(
    native.rawGraph.failures,
    '/rawGraph/failures',
    claims.failures,
    true,
    true
  );
  return {
    version: 1,
    kind: 'm4-selected-context-inspection',
    nativeOutputDigest,
    sourcePolicyDigest: native.sourcePolicyDigest,
    authorityDigest: native.authorityDigest,
    modelDigest: native.modelDigest,
    workerOutputDigest: native.workerOutputDigest,
    nativeEvent: native.eventBinding,
    runtimeContextSha256: runtime.contextSha256,
    runtimePolicySha256: runtime.policySha256,
    roots: array(census.roots),
    sourceBookends: census.sourceBookends,
    censusModelDigest: census.modelDigest,
    censusSourcePolicyDigest: census.sourcePolicyDigest,
    selectedIdentities: census.selectedIdentities,
    unobservedSelectedIdentities: claims.unobservedSelectedIdentities,
    contextOccurrences: claims.contextOccurrences,
    observations: census.observations,
    observationKeys: claims.keys,
    attributions: census.attributions,
    frames: census.frames,
    original: {
      selectedIdentities: range(
        '/rawGraph/m4Contexts/selectedIdentities',
        census.selectedIdentities
      ),
      observations: range('/rawGraph/m4Contexts/observations', census.observations),
      attributions: range('/rawGraph/m4Contexts/attributions', census.attributions),
      censusUnresolved: range('/rawGraph/m4Contexts/unresolved', census.unresolved),
      reportUnresolved: range('/report/unresolvedIncomplete', native.report.unresolvedIncomplete),
      rawFailures: {
        ...range('/raw/failures', native.raw.failures),
        semantics:
          'Identity-deduplicated raw failures; never an emission count or context allocation.',
      },
    },
    diagnostics: { graphDiagnostics, rawDiagnostics, reportDiagnostics },
    selectedPathDiagnostics: describeM4SelectedPathInspection(native),
    graphFailures,
    scope:
      'Only the four selected original emission kinds are attributed; other paths remain unresolved.',
    acceptedCoverage: 0,
    runtimeEvidenceAccepted: false,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
    productionCCredit: 0,
  };
}
