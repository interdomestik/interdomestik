import { createM4ContextCensus } from './db-access-m4-context-census.mjs';
import { isVerifiedProviderUnitSource } from './db-access-provider-unit-source.mjs';
import { createReferences } from './db-access-references.mjs';
import { isFunction } from './db-access-source.mjs';
import { createGraphEntryEmitter } from './db-access-graph-emissions.mjs';
import { createGraphSessionDriver } from './db-access-graph-session-driver.mjs';
import { createGraphProvenance } from './db-access-graph-provenance.mjs';

import { inspectGraphRoots } from './db-access-graph-roots.mjs';
import { createGraphInspector } from './db-access-graph-inspector.mjs';

export function createGraphTraversal(
  model,
  provenance,
  inventory,
  frozenBootstrap = [],
  providerUnit
) {
  if (providerUnit && !isVerifiedProviderUnitSource(providerUnit))
    throw new Error('incomplete: unauthenticated provider graph boundary');
  const providerFiles = new Set([
    ...(providerUnit?.files ?? []),
    ...(providerUnit?.producerHarnessFiles ?? []),
    ...(providerUnit?.namedProofFiles ?? []),
  ]);
  const state = { output: null };
  const census = createM4ContextCensus(model, provenance, inventory, providerUnit?.m4Proof);
  const emitEntries = createGraphEntryEmitter(inventory.entries, census);
  const references = createReferences(model, provenance);
  const forContext = createGraphProvenance(provenance);
  // An unframed function with actual dispatch callers is inspected once per caller frame unless
  // it escaped or is also opened directly. Returns true when it fanned out.
  function inspectDispatchContexts(owner, origin, stack, depth, context) {
    if (!isFunction(owner) || context || !provenance.dispatch) return false;
    const state = provenance.dispatch.state();
    const callers = provenance.dispatch.contextsFor(owner);
    if (!callers.length || state.escaped.has(owner) || state.openFns.has(owner)) return false;
    for (const caller of callers)
      inspect(owner, origin, stack, depth, caller.callNode, caller.context, caller.definingContext);
    return true;
  }
  // Every caller passes stack and depth; each outer root starts with a fresh Map and depth 0.
  function inspect(owner, origin, stack, depth, invocation, context, definingContext) {
    if (inspectDispatchContexts(owner, origin, stack, depth, context)) return;
    const token = census?.enter(owner, origin, invocation, context, definingContext);
    try {
      inspectOwner(owner, origin, stack, depth, invocation, context, definingContext);
    } finally {
      census?.leave(token);
    }
  }
  const inspectOwner = createGraphInspector({
    model,
    provenance,
    inventory,
    providerFiles,
    frozenBootstrap,
    census,
    references,
    forContext,
    emitEntries,
    state,
    inspect,
  });
  const rootInput = { model, inventory, references, inspect };
  return createGraphSessionDriver(inventory, provenance, (origins, output) => {
    state.output = output;
    const { incomplete } = output;
    census?.begin();
    const detach = census?.installDiagnostics(incomplete);
    try {
      inspectGraphRoots({ ...rootInput, origins, incomplete });
    } finally {
      detach?.();
    }
    if (census) output.m4Contexts = census.finish(origins, incomplete.entries);
  });
}
