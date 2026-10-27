import { createM4SelectedPathObserver } from './db-access-m4-selected-path-observer.mjs';
import { createM4AttributionCollector } from './db-access-m4-context-attribution.mjs';
import { digest } from './db-access-trust.mjs';
import { isUnsafe } from './db-access-inventory.mjs';
import { m4SourceMatchesModel } from './db-access-m4-proof-source.mjs';
import { isM4ContextInventory } from './db-access-m4-native-prerequisite.mjs';

const fail = reason => {
  throw Error('incomplete: M4 context census ' + reason);
};
const locator = (model, node) =>
  node ? [model.fileOf(node), node.pos, node.end, node.kind] : null;

// Observation only. This neither changes dispatch resolution nor grants admission.
export function createM4ContextCensus(model, provenance, inventory, source) {
  if (!source) return undefined;
  if (!m4SourceMatchesModel(source, model) || !isM4ContextInventory(model, inventory, source))
    fail('unowned source/inventory');
  const files = new Set(source.files);
  const selected = inventory.entries.filter(row => files.has(row.file));
  const owners = new Map();
  for (const row of selected) {
    const rows = owners.get(row._owner) ?? [];
    rows.push(row);
    owners.set(row._owner, rows);
  }
  const frames = new WeakMap();
  const frameRecords = new Map();
  function frame(token, seen = new Set()) {
    if (!token) return null;
    if (frames.has(token)) return frames.get(token);
    if (seen.has(token) || seen.size >= 64) return 'unresolved-frame';
    const bindings = provenance.dispatch?.bindingsFor(token);
    if (!bindings) return 'unknown-frame';
    const next = new Set(seen).add(token);
    const values = bindings.map(item => ({
      parameter: locator(model, item.parameter),
      argument: locator(model, item.argument),
      caller: frame(item.callerContext, next),
    }));
    const key = digest(JSON.stringify(values));
    frames.set(token, key);
    frameRecords.set(key, values);
    return key;
  }
  const path = createM4SelectedPathObserver({
    isSelectedOwner: owner => owners.has(owner),
    locate: node => locator(model, node),
    peekBindings: token => provenance.dispatch?.peekBindingsFor?.(token),
  });
  let rows, attribution;
  return Object.freeze({
    begin() {
      rows = new Map();
      attribution = createM4AttributionCollector();
      path.begin();
    },
    installDiagnostics: collector => path.installDiagnostics(collector),
    enter: (owner, origin, invocation, context, definingContext) =>
      path.enter(owner, origin, invocation, context, definingContext),
    leave: token => path.leave(token),
    enterEvaluation: (context, site) => path.enterEvaluation(context, site),
    leaveEvaluation: token => path.leaveEvaluation(token),
    observe(owner, origin, invocation, context, definingContext, outcome) {
      const entries = owners.get(owner);
      if (!entries) return;
      const observed = new Map();
      const state = provenance.dispatch?.state();
      for (const entry of entries) {
        const row = {
          identity: entry.identity,
          origin,
          owner: locator(model, owner),
          invocation: locator(model, invocation),
          context: frame(context),
          definingContext: frame(definingContext),
          outcome,
          receiver: entry.tenantPosture,
          unsafe: isUnsafe(entry),
          incomplete: Boolean(entry._incomplete),
          indirect: Boolean(entry._indirect),
          escaped: Boolean(state?.escaped.has(owner)),
          open: Boolean(state?.openFns.has(owner)),
          dispatchUnknown: [...(state?.reasons ?? [])].sort(),
        };
        const key = JSON.stringify(row);
        const previous = rows.get(key);
        if (previous) previous.occurrences++;
        else rows.set(key, { ...row, occurrences: 1 });
        observed.set(entry, rows.get(key));
      }
      path.activate(observed);
      return observed;
    },
    attribute(observed, kind, reason, entry) {
      if (!observed) return;
      const selected = entry ? [observed.get(entry)].filter(Boolean) : [...observed.values()];
      if (selected.length) {
        const key = attribution.add(selected, kind, reason);
        if (kind !== 'entry-unsafe') path.legacy(key, selected[0].origin, reason);
      }
    },
    finish(origins, incomplete) {
      if (!m4SourceMatchesModel(source, model) || !isM4ContextInventory(model, inventory, source))
        fail('source/inventory changed');
      return {
        version: 1,
        sourcePolicyDigest: source.policyDigest,
        sourceBookends: source.bookends,
        modelDigest: digest(JSON.stringify([...model.sources])),
        roots: [...origins],
        selectedIdentities: selected.map(row => row.identity),
        observations: [...rows.values()],
        attributions: attribution.entries(),
        pathDiagnostics: path.finish(),
        frames: Object.fromEntries(frameRecords),
        unresolved: incomplete,
        allExecutableContextsQualified: false,
        runtimeAdmission: false,
      };
    },
  });
}
