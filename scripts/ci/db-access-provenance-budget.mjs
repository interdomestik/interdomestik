// One synchronous public provenance/handle query owns the fuel. All contextual and legacy
// fallbacks share it; a nested query cannot reset it. The existing handle-shape limit remains
// separate. Exhaustion is sticky for this query and retained as fail-closed analysis evidence.
// The unchanged production control peaks below 89k visits; leave bounded headroom for real roots.
const WORK_LIMIT = 131072;
const UNKNOWN = 'unknown';

export function createProvenanceBudget(analysisUnknown = new Set()) {
  let active;
  function exhaust() {
    active.exhausted = true;
    analysisUnknown.add('provenance-work-bound');
    return false;
  }
  return {
    run(compute) {
      const root = active === undefined;
      if (root) active = { remaining: WORK_LIMIT, exhausted: false };
      try {
        if (active.exhausted) return UNKNOWN;
        const result = compute();
        return active.exhausted ? UNKNOWN : result;
      } finally {
        if (root) active = undefined;
      }
    },
    enter() {
      if (!active) throw new Error('provenance traversal requires root fuel');
      if (active.exhausted) return false;
      if (--active.remaining < 0) return exhaust();
      return true;
    },
    get exhausted() {
      return active?.exhausted === true;
    },
  };
}
