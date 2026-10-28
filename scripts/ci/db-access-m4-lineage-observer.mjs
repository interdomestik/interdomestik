// Separate observation axis. Never installs/wraps a diagnostic collector or emits debt.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('M4 lineage metadata refused: ' + reason);
};
const MAX_BYTES = 32 * 1024 * 1024;
const add = (a, b) => {
  const result = a + b;
  if (!Number.isSafeInteger(result) || result < 0) fail('multiplicity overflow');
  return result;
};

// Fixed readers are supplied by census, not by a runtime/coverage evidence caller.
// peekBindings must be dispatch.peekBindingsFor, never state/build/bindingsFor.
export function createLineageObserver(selection, locate, peekBindings) {
  let rows, tokens, frames, metadataBytes, active, emissions;
  function charge(value) {
    metadataBytes = add(metadataBytes, Buffer.byteLength(JSON.stringify(value)));
    if (metadataBytes > MAX_BYTES) fail('32MiB additive metadata ceiling');
  }
  function frame(token, depth = 0) {
    if (token === null || token === undefined) return null;
    if ((typeof token !== 'object' && typeof token !== 'function') || depth >= 64)
      fail('frame token/depth');
    if (tokens.has(token)) {
      const previous = tokens.get(token);
      if (previous.status === 'pending') previous.status = 'recursive';
      return previous.id;
    }
    const row = { id: 'lineage-frame:' + frames.length, status: 'pending' };
    tokens.set(token, row);
    frames.push(row);
    const bindings = peekBindings(token);
    if (bindings === undefined) row.status = 'unavailable';
    else {
      if (!Array.isArray(bindings)) fail('peek snapshot');
      row.bindings = bindings.map(value => ({
        parameter: locate(value.parameter),
        argument: locate(value.argument),
        callerFrame: frame(value.callerContext, depth + 1),
      }));
      if (row.status !== 'recursive') row.status = 'available';
    }
    charge(row);
    return row.id;
  }
  return Object.freeze({
    begin() {
      if (active) fail('unfinished batch');
      rows = new Map();
      emissions = new Map();
      tokens = new WeakMap();
      frames = [];
      metadataBytes = 0;
      active = true;
    },
    observe(owner, origin, invocation, context, definingContext, outcome) {
      if (!active) fail('inactive batch');
      const selected = selection.owners.get(owner);
      if (!selected) return;
      const row = {
        origin,
        owner: selected.owner,
        invocation: locate(invocation),
        context: frame(context),
        definingContext: frame(definingContext),
        outcome,
        inventoryIndices: selected.entries.map(entry => entry.inventoryIndex),
        memberships: selected.memberships,
        dispatchClassification: 'no-additional-state-query',
      };
      const id = JSON.stringify(row),
        previous = rows.get(id);
      if (previous) previous.occurrences = add(previous.occurrences, 1);
      else {
        charge(row);
        rows.set(id, { ...row, occurrences: 1 });
      }
      return { observationKey: hash(id), inventoryIndices: row.inventoryIndices, origin };
    },
    attribute(visit, kind, reason, entry) {
      if (!visit || !entry || !['entry-incomplete', 'entry-unsafe'].includes(kind)) return;
      const selected = selection.nativeEntries.get(entry);
      if (!selected || !visit.inventoryIndices.includes(selected.inventoryIndex)) return;
      const row = {
        observationKey: visit.observationKey,
        inventoryIndex: selected.inventoryIndex,
        identity: selected.identity,
        origin: visit.origin,
        kind,
        reason,
      };
      const id = JSON.stringify(row),
        previous = emissions.get(id);
      if (previous) previous.occurrences = add(previous.occurrences, 1);
      else {
        charge(row);
        emissions.set(id, { ...row, occurrences: 1 });
      }
    },
    finish(binding, origins) {
      if (!active) fail('inactive batch');
      active = false;
      const observations = [...rows.values()];
      return {
        version: 1,
        sourcePolicyDigest: binding.sourcePolicyDigest,
        sourceBookends: structuredClone(binding.sourceBookends),
        modelDigest: binding.modelDigest,
        roots: [...origins],
        selection: structuredClone(selection.description),
        observations: structuredClone(observations),
        entryEmissions: structuredClone([...emissions.values()]),
        frames: structuredClone(frames),
        observationSha256: hash(JSON.stringify(observations)),
        metadataBytes,
        diagnosticAttribution: 'unresolved-outside-original-selected-path-axis',
        acceptedCoverage: 0,
        runtimeAdmission: false,
        allExecutableContextsQualified: false,
      };
    },
  });
}
