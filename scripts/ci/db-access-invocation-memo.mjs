const PENDING = Symbol('pending');

// Cohesive generation and memo lifecycle shared by one value evaluator. No source safety
// decision is made here; a cycle is reported through the evaluator's existing fail callback.
export function createResolutionMemo(fail) {
  let generation = 0;
  const nextGeneration = () => ++generation;
  // One allocation per const local or parameter per frame within one resolution context;
  // re-entry while pending is a cycle. A frame can outlive the resolution that created it through
  // an opaque context token. A stored value was produced under its own context's escape and
  // mutation answers, step budget, active and running stacks, and its intermediary descriptors
  // were pushed only to that context's invocation list. Reusing it from another context could
  // return a stale value and would omit those queries and intermediaries, so an entry from another
  // generation is never reused: the new context recomputes from the frame's immutable bindings,
  // exactly as a fresh frame would. Within one context answers cannot change and every
  // intermediary of a hit is already recorded in ctx.invocations.
  function memo(ctx, frame, key, compute) {
    const stored = frame.locals.get(key);
    if (stored?.generation === ctx.generation) {
      if (stored.value === PENDING) return fail(ctx, 'cycle');
      return stored.value;
    }
    const entry = { generation: ctx.generation, value: PENDING };
    frame.locals.set(key, entry);
    const value = compute();
    if (value) entry.value = value;
    else frame.locals.delete(key);
    return value;
  }
  return { nextGeneration, memo };
}
