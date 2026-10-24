import {
  sourceDependencyObserver,
  validSourceDependencies,
} from './db-access-source-dependencies.mjs';
const settledModels = new WeakMap();
const fields = [
  'forContext',
  'provenance',
  'tenantHandle',
  'mutations',
  'unsafeMutations',
  'escapedFns',
  'analysisUnknown',
];
export function registerSettledGraphProvenance(provenance, model) {
  const observer = sourceDependencyObserver(model);
  if (observer)
    settledModels.set(provenance, {
      observer,
      model,
      fields: fields.map(key => provenance[key]),
    });
}
function settledEvidence(provenance) {
  const registered = settledModels.get(provenance);
  if (
    !registered ||
    fields.some((key, index) => provenance[key] !== registered.fields[index]) ||
    sourceDependencyObserver(registered.model) !== registered.observer
  )
    return;
  const set = provenance.analysisUnknown;
  if (
    !(set instanceof Set) ||
    Object.getPrototypeOf(set) !== Set.prototype ||
    Object.hasOwn(set, 'add') ||
    Object.hasOwn(set, 'has') ||
    Object.hasOwn(set, 'size')
  )
    return;
  const reasons = [...set];
  if (reasons.some(reason => typeof reason !== 'string')) return;
  return { observer: registered.observer, set, reasons };
}
function sameEvidence(provenance, recorded) {
  const current = settledEvidence(provenance);
  return (
    current &&
    current.set === recorded.set &&
    current.reasons.length === recorded.reasons.length &&
    current.reasons.every(reason => recorded.reasons.includes(reason))
  );
}
// One graph traversal observes a settled provenance model. Known answers retain their existing
// exact raw-node/caller-frame memo. Complete UNKNOWN is eligible only in an open native frame
// with validated live lexical metadata and no raw/external/export checker reads. Original facades
// still own nested queries and shared root fuel; reentrant queries bypass this memo.
export function createGraphProvenance(provenance) {
  const facades = new WeakMap();
  const openContext = {};
  let active = false;
  let epoch = 0;
  let state, mutations, unsafeMutations, escaped;
  function generation() {
    const nextState = provenance.dispatch?.state();
    const nextMutations = provenance.mutations?.size;
    const nextUnsafe = provenance.unsafeMutations?.size;
    const nextEscaped = provenance.escapedFns?.size;
    // Mutation and escape sets grow monotonically during settlement. A dispatch reset also
    // invalidates reuse, even if the sets have the same sizes. No resolver/variant is memoized.
    if (
      state !== nextState ||
      mutations !== nextMutations ||
      unsafeMutations !== nextUnsafe ||
      escaped !== nextEscaped
    ) {
      epoch += 1;
      state = nextState;
      mutations = nextMutations;
      unsafeMutations = nextUnsafe;
      escaped = nextEscaped;
    }
    return epoch;
  }
  function memoize(query, open) {
    const values = new WeakMap();
    return raw => {
      if (active || !raw) return query(raw);
      const current = generation();
      const prior = values.get(raw);
      if (
        prior?.epoch === current &&
        (prior.value !== 'unknown' ||
          (sameEvidence(provenance, prior.evidence) && validSourceDependencies(prior.dependencies)))
      )
        return prior.value;
      let value, dependencies;
      const eligible = open && settledEvidence(provenance);
      active = true;
      try {
        if (eligible) {
          const result = eligible.observer.capture(() => query(raw));
          value = result.value;
          dependencies = result.dependencies;
        } else value = query(raw);
      } finally {
        active = false;
      }
      // Exhausted roots retain their sticky analysis evidence in the original Set. Exceptions,
      // changing generations, framed queries and uncertifiable source reads cannot add UNKNOWN
      // entries. A hit validates every captured live dependency before reusing the result.
      if (generation() === current) {
        if (value !== 'unknown') values.set(raw, { epoch: current, value });
        else if (dependencies !== undefined) {
          const evidence = settledEvidence(provenance);
          if (evidence) values.set(raw, { epoch: current, value, evidence, dependencies });
        }
      }
      return value;
    };
  }
  function forContext(context) {
    const key = context === undefined ? openContext : context;
    if (facades.has(key)) return facades.get(key);
    const scoped = provenance.forContext?.(context) ?? provenance;
    const facade = {
      ...scoped,
      forContext,
      provenance: memoize(raw => scoped.provenance(raw), context === undefined),
      tenantHandle: memoize(raw => scoped.tenantHandle(raw), context === undefined),
    };
    facades.set(key, facade);
    return facade;
  }
  return forContext;
}
