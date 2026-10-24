import { inspectGraph } from './db-access-graph-core.mjs';
export { testOnlySource } from './db-access-graph-roots.mjs';

export function inspectChangedEdges(
  model,
  provenance,
  inventory,
  frozenBootstrap = [],
  providerUnit
) {
  return inspectGraph(model, provenance, inventory, frozenBootstrap, providerUnit);
}
// Internal producer entry; inventory.changed always remains the complete original set.
export function inspectOwnedGraphOrigins(
  model,
  provenance,
  inventory,
  frozenBootstrap,
  providerUnit,
  origins
) {
  if (
    !Array.isArray(origins) ||
    !origins.length ||
    new Set(origins).size !== origins.length ||
    origins.some(origin => !inventory.changed.has(origin))
  )
    throw new Error('incomplete: invalid internal graph origins');
  return inspectGraph(model, provenance, inventory, frozenBootstrap, providerUnit, origins);
}
