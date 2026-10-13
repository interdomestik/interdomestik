// One graph traversal observes a settled provenance model. Reuse only complete, known public
// query answers for the exact raw AST node and caller frame. Original facades still own every
// nested query and its shared root fuel; reentrant queries deliberately bypass this memo.
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
  function memoize(query) {
    const values = new WeakMap();
    return raw => {
      if (active || !raw) return query(raw);
      const current = generation();
      const prior = values.get(raw);
      if (prior?.epoch === current) return prior.value;
      let value;
      active = true;
      try {
        value = query(raw);
      } finally {
        active = false;
      }
      // Exhausted roots return unknown. Their sticky analysis evidence remains in the original
      // set; neither unknown, interrupted, nor changing-state computations become cache entries.
      if (value !== 'unknown' && generation() === current)
        values.set(raw, { epoch: current, value });
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
      provenance: memoize(raw => scoped.provenance(raw)),
      tenantHandle: memoize(raw => scoped.tenantHandle(raw)),
    };
    facades.set(key, facade);
    return facade;
  }
  return forContext;
}
