import { pathFail } from './db-access-m4-path-storage.mjs';

// Fixed readers are constructed only by the authenticated census. This helper
// never calls bindingsFor, dispatch state/build, a resolver, or a native evaluator.
export function createM4PathMetadata(locate, peekBindings, budget) {
  const locations = new WeakMap(),
    tokens = new WeakMap(),
    frames = [];
  function location(node) {
    if (!node) return null;
    if (!locations.has(node)) locations.set(node, locate(node));
    return locations.get(node);
  }
  function frame(token, depth = 0) {
    if (token === null || token === undefined) return null;
    if (typeof token !== 'object' && typeof token !== 'function') pathFail('invalid frame token');
    const previous = tokens.get(token);
    if (previous) {
      if (previous.status === 'pending') previous.status = 'recursive';
      return previous.id;
    }
    if (depth >= 64) pathFail('frame metadata depth ceiling');
    const row = { id: 'frame:' + frames.length, status: 'pending' };
    tokens.set(token, row);
    frames.push(row);
    const bindings = peekBindings(token);
    if (bindings === undefined) row.status = 'unavailable';
    else {
      if (!Array.isArray(bindings)) pathFail('invalid peek snapshot');
      const values = bindings.map(binding => ({
        parameter: location(binding.parameter),
        argument: location(binding.argument),
        callerFrame: frame(binding.callerContext, depth + 1),
      }));
      if (row.status !== 'recursive') {
        row.status = 'available';
        row.bindings = values;
      }
    }
    budget.charge('metadata', JSON.stringify(row));
    return row.id;
  }
  return { location, frame, output: () => frames };
}
