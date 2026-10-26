import { describeM4ContextInspection } from './db-access-m4-context-projection.mjs';
import { createM4AttributionCollector } from './db-access-m4-context-attribution.mjs';

// Pure data fixtures, not authenticated native or runtime handles.
export const observation = overrides => ({
  identity: 'unsafe',
  origin: 'root.ts',
  owner: ['selected.ts', 0, 10, 262],
  invocation: null,
  context: null,
  definingContext: null,
  outcome: 'visited',
  receiver: 'ambient',
  unsafe: true,
  incomplete: false,
  indirect: false,
  escaped: false,
  open: false,
  dispatchUnknown: [],
  occurrences: 1,
  ...overrides,
});
export function fixture() {
  const observations = [
    observation({}),
    observation({ context: 'unknown-frame' }),
    observation({ identity: 'incomplete', incomplete: true, occurrences: 2 }),
  ];
  const collector = createM4AttributionCollector();
  collector.add([observations[0]], 'entry-unsafe', 'unsafe');
  collector.add([observations[1]], 'entry-unsafe', 'unsafe');
  collector.add([observations[2]], 'entry-incomplete', 'why');
  collector.add([observations[2]], 'entry-incomplete', 'why');
  const incomplete = [
    { file: 'root.ts', reason: 'why', occurrences: 3 },
    { file: 'other.ts', reason: 'unknown', occurrences: 4 },
  ];
  const diagnostics = [
    ...incomplete,
    { file: '<adoption-analysis>', reason: 'old', occurrences: 5 },
  ];
  const failures = [
    { identity: 'unsafe', mountedFrom: 'root.ts', reason: 'unsafe' },
    { identity: 'unsafe', mountedFrom: 'root.ts', reason: 'unsafe' },
    { identity: 'unselected', mountedFrom: 'root.ts', reason: 'other' },
  ];
  const census = {
    roots: ['root.ts'],
    sourceBookends: { before: 'source', after: 'source' },
    sourcePolicyDigest: 'source',
    modelDigest: 'census-model',
    observations,
    selectedIdentities: ['unsafe', 'incomplete', 'unobserved'],
    attributions: collector.entries(),
    frames: {},
    unresolved: incomplete,
  };
  const native = {
    sourcePolicyDigest: 'source',
    authorityDigest: 'authority',
    modelDigest: 'model',
    workerOutputDigest: 'worker',
    eventBinding: { tree: 'tree', event: 'event' },
    rawGraph: { m4Contexts: census, incomplete, failures },
    raw: { diagnostics, failures: [failures[0], failures[2]] },
    report: {
      incomplete: [...diagnostics, { file: '<analysis>', reason: 'later', occurrences: 6 }],
      unresolvedIncomplete: [{ file: '<m4>', reason: 'not qualified' }],
    },
  };
  const runtime = {
    contextSha256: 'runtime-event',
    policySha256: 'runtime-policy',
    privateHandle: 'must not leak',
  };
  return {
    native,
    runtime,
    inspect: () => describeM4ContextInspection(native, 'native-output', runtime),
  };
}
