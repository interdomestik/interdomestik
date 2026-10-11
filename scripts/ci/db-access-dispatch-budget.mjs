// Dispatch work accounting and dependency-validated reuse for one dispatch build.
//
// Budget unit: one dispatch round. The first frame of every parsed CallExpression is source
// traversal. It is finite under the source materialization limits and is never charged or skipped.
// Every additional caller frame of a call is semantic expansion, and so is every
// invocation-context registration (resolved target or intermediary). Expansion is charged against
// maxEntries. A caller that observes an exhausted budget must fail closed for every call; nothing
// is silently dropped.
export function checkDispatchLimits({ maxRounds, maxEntries }) {
  if (!Number.isInteger(maxRounds) || maxRounds < 1)
    throw new TypeError('maxRounds must be a positive integer');
  if (!Number.isInteger(maxEntries) || maxEntries < 0)
    throw new TypeError('maxEntries must be a non-negative integer');
}

export function createDispatchBudget(maxEntries) {
  let spent = 0;
  return {
    spend() {
      spent += 1;
      return spent <= maxEntries;
    },
    get exhausted() {
      return spent > maxEntries;
    },
    get spent() {
      return spent;
    },
  };
}

// Within one build, the escaped set is the only resolver input that changes, and it changes
// monotonically. Mutation, canonical and reference answers are build-invariant, and reset()
// discards the build together with its resolver, frames and memos. A resolution is a deterministic
// function of its call node, its frame token's immutable bindings and the answers it queries:
// frame-local value memos are scoped to the resolution context that computed them
// (db-access-invocation-values.mjs), so a retained frame token recomputes every const local and
// parameter and never returns a stale value, omits an intermediary invocation or skips an escape
// query that a fresh frame would make. record() therefore captures the first answer of every
// escape query of a computation, including those behind nested const/parameter memos. valid()
// admits reuse only while every captured answer is still identical, so a reused value equals what
// the same computation would return now. Recording never nests.
export function createDependencyMemo(escaped, identityOf) {
  let active;
  function isEscaped(node) {
    const identity = identityOf(node);
    const answer = escaped.has(identity);
    if (active && !active.has(identity)) active.set(identity, answer);
    return answer;
  }
  function record(compute) {
    if (active) throw new Error('nested dispatch dependency recording');
    const deps = new Map();
    active = deps;
    try {
      return Object.freeze({ value: compute(), deps });
    } finally {
      active = undefined;
    }
  }
  function valid(recorded) {
    if (!recorded) return false;
    for (const [identity, answer] of recorded.deps)
      if (escaped.has(identity) !== answer) return false;
    return true;
  }
  return Object.freeze({ isEscaped, record, valid });
}
