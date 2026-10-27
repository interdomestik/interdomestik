import ts from 'typescript';
import { digest } from './db-access-trust.mjs';
import {
  createM4AttributionCollector,
  m4AttributionKey,
  m4ObservationKey,
} from './db-access-m4-context-attribution.mjs';

// Pure data-contract fixtures; they do not construct native/source/worker authority.
export function pathFixture(origin = 'fixture.ts') {
  const file = 'fixture.ts';
  const sf = ts.createSourceFile(
    file,
    'function selected(value) { return value; }\nselected(1);',
    ts.ScriptTarget.Latest,
    true
  );
  const owner = sf.statements[0],
    call = sf.statements[1].expression;
  const locator = node => [file, node.pos, node.end, node.kind];
  const binding = {
    parameter: locator(owner.parameters[0]),
    argument: locator(call.arguments[0]),
    caller: null,
  };
  const context = digest(JSON.stringify([binding]));
  const row = {
    identity: 'selected-a',
    origin,
    owner: locator(owner),
    invocation: locator(call),
    context,
    definingContext: null,
    outcome: 'visited',
    receiver: 'ambient',
    unsafe: true,
    incomplete: true,
    indirect: false,
    escaped: true,
    open: true,
    dispatchUnknown: [],
    occurrences: 2,
  };
  const sibling = {
    ...row,
    identity: 'selected-b',
    receiver: 'tenant-context',
    unsafe: false,
    incomplete: false,
  };
  const legacy = createM4AttributionCollector();
  legacy.add([row], 'entry-incomplete', 'legacy');
  legacy.add([row], 'entry-incomplete', 'legacy');
  const attributions = legacy.entries();
  const pathDiagnostics = {
    version: 1,
    selections: [
      { id: 'selection:0', observationKeys: [row, sibling].map(m4ObservationKey).sort() },
    ],
    frames: [
      {
        id: 'frame:0',
        status: 'available',
        bindings: [{ parameter: binding.parameter, argument: binding.argument, callerFrame: null }],
      },
    ],
    scopes: [
      {
        id: 'scope:0',
        selectionId: 'selection:0',
        origin,
        emitterOwner: locator(owner),
        invocation: locator(call),
        traversalContext: 'frame:0',
        definingContext: null,
        evaluationContext: 'frame:0',
        evaluationSite: null,
        evaluationContextStatus: 'traversal-context-only',
      },
    ],
    records: [
      {
        scopeId: 'scope:0',
        diagnosticKey: JSON.stringify([origin, 'legacy']),
        legacyDiagnosticKey: m4AttributionKey(attributions[0]),
        occurrences: 2,
      },
      {
        scopeId: 'scope:0',
        diagnosticKey: JSON.stringify([origin, 'descendant']),
        legacyDiagnosticKey: null,
        occurrences: 1,
      },
    ],
    counters: {
      collectorInitialRawCount: 0,
      collectorFinalRawCount: 4,
      wrappedOccurrences: 4,
      selectedPathOccurrences: 3,
      legacyOverlapOccurrences: 2,
      additionalPathOccurrences: 1,
      offPathOccurrences: 1,
      pushCalls: 4,
      storage: { encodedBytes: 3000, scopes: 1, records: 2, metadata: 2 },
    },
    outsideScopeApplicability: 'unresolved',
    runtimeAdmission: false,
    allExecutableContextsQualified: false,
  };
  return {
    model: { parsed: new Map([[file, sf]]) },
    locator,
    call,
    batch: { roots: [origin], observations: [row, sibling], attributions, pathDiagnostics },
    result: {
      incomplete: [
        { file: origin, reason: 'legacy', occurrences: 3 },
        { file: origin, reason: 'descendant', occurrences: 1 },
        { file: '<analysis>', reason: 'late', occurrences: 1 },
      ],
      incompleteRawCount: 5,
    },
  };
}
