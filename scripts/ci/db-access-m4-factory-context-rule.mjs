// Data-only conjunction, called after the existing private native/P2 owners validate once.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = reason => {
  throw Error('M4 factory context join refused: ' + reason);
};
const RETURN_REASON = 'unsupported returned handle analysis bound, cycle or mutated value';
export const lineageObservationKey = row =>
  hash(
    JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'occurrences')))
  );
function emptyFrame(id, frames) {
  if (id === null) return true;
  const frame = frames.find(value => value.id === id);
  return (
    frame?.status === 'available' && Array.isArray(frame.bindings) && frame.bindings.length === 0
  );
}
const count = value => Number.isSafeInteger(value) && value > 0;

export function deriveFactoryContextDecisions(native, construction) {
  const census = native.rawGraph.m4Contexts,
    lineage = census.affectedLineage;
  if (
    !lineage ||
    !same(
      lineage.batches.flatMap(batch => batch.roots),
      census.roots
    ) ||
    new Set(census.roots).size !== census.roots.length
  )
    fail('complete original root partition');
  const entries = native.inventory.entries;
  return construction.factories.map(factory => {
    const matching = entries.flatMap((entry, index) =>
      entry.row.identity === factory.identity ? [{ entry, index }] : []
    );
    if (matching.length !== 1) fail('unique actual current factory inventory identity');
    const { entry, index } = matching[0],
      selected = lineage.selection.entries.filter(row => row.inventoryIndex === index);
    if (
      !same(entry.owner, factory.owner) ||
      entry.row.file !== factory.sourceFile ||
      entry.row.method !== 'escape' ||
      entry.row.source !== factory.returnText ||
      entry.row.reason !== RETURN_REASON ||
      entry.incomplete !== true ||
      entry.indirect === true ||
      selected.length !== 1 ||
      selected[0].identity !== factory.identity ||
      !same(selected[0].owner, factory.owner) ||
      !same(selected[0].operation, factory.operation)
    )
      fail('exact current inventory/operation/owner source predicate');
    const contexts = [],
      emissions = [];
    for (const [batchIndex, batch] of lineage.batches.entries()) {
      if (!Array.isArray(batch.entryEmissions)) fail('missing original entry-emission correlation');
      const emittedByContext = new Map();
      for (const emitted of batch.entryEmissions) {
        if (emitted.inventoryIndex !== index) continue;
        const list = emittedByContext.get(emitted.observationKey) ?? [];
        list.push(emitted);
        emittedByContext.set(emitted.observationKey, list);
      }
      const seenContexts = new Set();
      for (const [observationIndex, observation] of batch.observations.entries()) {
        if (!observation.inventoryIndices.includes(index)) continue;
        if (!count(observation.occurrences)) fail('original context multiplicity');
        const key = lineageObservationKey(observation),
          reasons = [];
        if (seenContexts.has(key)) fail('duplicate native context');
        seenContexts.add(key);
        if (!same(observation.owner, factory.owner))
          fail('foreign owner at selected inventory index');
        if (observation.origin !== factory.sourceFile)
          reasons.push('retained foreign source/mount');
        if (observation.outcome !== 'visited') reasons.push('recursion/bound/provider context');
        if (observation.invocation !== null && !same(observation.invocation, factory.registration))
          reasons.push('invocation not fixed root/registration');
        if (
          !emptyFrame(observation.context, batch.frames) ||
          !emptyFrame(observation.definingContext, batch.frames)
        )
          reasons.push('unavailable/nonempty/recursive caller frame');
        const emitted = emittedByContext.get(key) ?? [];
        if (
          emitted.length !== 1 ||
          emitted[0].identity !== factory.identity ||
          emitted[0].kind !== 'entry-incomplete' ||
          emitted[0].reason !== RETURN_REASON ||
          emitted[0].occurrences !== observation.occurrences ||
          emitted[0].origin !== observation.origin
        )
          reasons.push('original return-obligation emission not exactly accounted');
        contexts.push({
          identity: factory.identity,
          inventoryIndex: index,
          batchIndex,
          observationIndex,
          observationKey: key,
          occurrences: observation.occurrences,
          qualified: reasons.length === 0,
          residualReasons: reasons,
          class: factory.class,
          refinement:
            'exact zero-arg literal callback has one fixed registry recipient and closed non-DB captures; original raw flags are retained',
        });
        emissions.push(...emitted);
      }
      if ([...emittedByContext.keys()].some(key => !seenContexts.has(key)))
        fail('orphan original entry emission');
    }
    const accepted = contexts.length > 0 && contexts.every(row => row.qualified);
    return {
      identity: factory.identity,
      inventoryIndex: index,
      contexts,
      emissions,
      accepted,
      residualReasons: contexts.length ? [] : ['no actual native factory context observed'],
      sourcePredicate: factory,
      completeIdentityContextConjunction: accepted,
    };
  });
}
