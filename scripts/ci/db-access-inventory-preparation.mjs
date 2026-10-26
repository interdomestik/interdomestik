import { analyzeModuleTargets } from './db-access-root-diagnostics.mjs';

function invalidateConsumers(dependenciesByFile, inventory, providerUnit) {
  const providerFiles = new Set(providerUnit?.files ?? []);
  let changed = true;
  const firstInvalidatingDependency = new Map();
  while (changed) {
    changed = false;
    for (const [file, dependencies] of dependenciesByFile) {
      const witness = !inventory.changed.has(file)
        ? [...dependencies].find(
            target =>
              inventory.changed.has(target) &&
              !(!providerFiles.has(file) && providerFiles.has(target))
          )
        : undefined;
      if (witness) {
        inventory.changed.add(file);
        firstInvalidatingDependency.set(file, witness);
        changed = true;
      }
    }
  }
  for (const entry of inventory.entries)
    if (inventory.changed.has(entry.file)) entry.historicalDebt = false;
  return firstInvalidatingDependency;
}

// Exact existing preparation transition. This function alone grants no proof authority.
export function prepareInventoryEffects(model, inventory, providerUnit) {
  const providerFiles = new Set(providerUnit?.files ?? []);
  const providerEntries = inventory.entries.filter(entry => providerFiles.has(entry.file));
  for (const entry of providerEntries) entry.historicalDebt = false;
  const directChanges = new Set(inventory.changed);
  const moduleTargets = analyzeModuleTargets(model);
  const firstInvalidatingDependency = invalidateConsumers(
    moduleTargets.dependencies,
    inventory,
    providerUnit
  );
  return { providerEntries, directChanges, moduleTargets, firstInvalidatingDependency };
}
