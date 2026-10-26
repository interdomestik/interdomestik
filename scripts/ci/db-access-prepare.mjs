import { isAuthorizedM4WorkerInput } from './db-access-m4-worker-input.mjs';
import { collectM4NativeInventory } from './db-access-m4-native-prerequisite.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ADOPTION } from './db-access-adoption.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import {
  providerUnitResolverSnapshot,
  verifyProviderUnitSource,
  providerUnitAnalysisModel,
} from './db-access-provider-unit-source.mjs';
import { verifyCurrentResolverSnapshot } from './db-access-resolver-snapshot.mjs';
import {
  authenticateSnapshot,
  boundaryChanges,
  candidateSources,
  digest,
  verifyResolverBoundary,
} from './db-access-trust.mjs';
import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { analyzeModuleTargets } from './db-access-root-diagnostics.mjs';
import { hydrateInventory } from './db-access-graph-workers.mjs';
const BASELINE = 'scripts/ci/db-access-baseline.json';
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

// Test harness may supply a real pinned fixture epoch; no CLI option exposes it.
export function prepareGuardModel(
  repoRoot,
  adoption = ADOPTION,
  providerPolicy = adoption === ADOPTION ? PROVIDER_UNIT_POLICY : undefined
) {
  const trusted = authenticateSnapshot(repoRoot, adoption);
  const reviewedBoundaryChanges = boundaryChanges(repoRoot, adoption);
  const baselineBytes = fs.readFileSync(path.join(repoRoot, BASELINE));
  if (digest(baselineBytes) !== adoption.files[BASELINE])
    throw new Error('incomplete: historical baseline modified');
  const baseline = JSON.parse(baselineBytes);
  if (!Array.isArray(baseline.entries)) throw new Error('incomplete: invalid historical baseline');
  const closureChanges = reviewedBoundaryChanges.filter(file => adoption.critical.includes(file));
  const providerResolver = providerPolicy
    ? providerUnitResolverSnapshot(repoRoot, adoption, providerPolicy)
    : new Map();
  const sources = candidateSources(repoRoot);
  // Fixture epochs retain their own resolver semantics; production has one fixed exact pair.
  const currentResolver =
    adoption === ADOPTION ? verifyCurrentResolverSnapshot(repoRoot, adoption) : new Map();
  for (const [file, content] of providerResolver) currentResolver.set(file, content);
  verifyResolverBoundary(repoRoot, trusted, currentResolver);
  // Candidate package/config files never define resolver authority.
  const resolutionSources = new Map(trusted);
  for (const [file, content] of providerResolver)
    if (file.endsWith('/package.json')) resolutionSources.set(file, content);
  for (const [file, content] of resolutionSources)
    if (file.endsWith('/package.json')) sources.set(file, content);
  const model = createSourceModel(sources, resolutionSources);
  const providerUnit = providerPolicy
    ? verifyProviderUnitSource(repoRoot, model, adoption, providerPolicy)
    : undefined;
  const providerFiles = new Set(providerUnit?.files ?? []);
  const producerHarnessFiles = new Set(providerUnit?.producerHarnessFiles ?? []);
  const namedProofFiles = new Set(providerUnit?.namedProofFiles ?? []);
  const unsupportedClosure = closureChanges.filter(file => !providerFiles.has(file));
  if (unsupportedClosure.length)
    throw new Error(`incomplete: critical tenant helper changed: ${unsupportedClosure.join(', ')}`);
  const provenance = createProvenance(
    providerUnit ? providerUnitAnalysisModel(model, providerUnit) : model
  );
  return {
    sources,
    resolutionSources,
    repoRoot,
    adoption,
    providerPolicy,
    trusted,
    reviewedBoundaryChanges,
    baselineBytes,
    baseline,
    model,
    providerUnit,
    providerFiles,
    producerHarnessFiles,
    namedProofFiles,
    provenance,
  };
}

export function completeGuardPreparation(prepared, workerInput) {
  const {
    sources,
    resolutionSources,
    repoRoot,
    adoption,
    providerPolicy,
    trusted,
    reviewedBoundaryChanges,
    baselineBytes,
    baseline,
    model,
    providerUnit,
    providerFiles,
    producerHarnessFiles,
    namedProofFiles,
    provenance,
  } = prepared;
  // Keep the complete pre-amendment operation inventory, including DB-looking mock
  // handles. The named boundary changes proof obligations, never inventory visibility.
  const inventoryProvenance =
    !workerInput && !providerUnit?.m4Proof && providerUnit?.namedProofFiles.length
      ? createProvenance(providerUnitAnalysisModel(model, providerUnit, true))
      : provenance;
  if (workerInput && providerUnit?.m4Proof && !isAuthorizedM4WorkerInput(workerInput, model))
    throw new Error('incomplete: M4 worker inventory lacks owned parentPort authority');
  const m4NativeInventory =
    !workerInput && providerUnit?.m4Proof
      ? collectM4NativeInventory(model, trusted, providerUnit)
      : undefined;
  const inventory =
    m4NativeInventory?.inventory ??
    (workerInput
      ? hydrateInventory(model, workerInput.inventory)
      : collectInventory(model, inventoryProvenance, trusted));
  // Provider SQL/handles remain inventoried and non-debt, with explicit fixed-runtime obligations.
  const providerEntries = inventory.entries.filter(entry => providerFiles.has(entry.file));
  for (const entry of providerEntries) entry.historicalDebt = false;
  const directChanges = new Set(inventory.changed);
  const moduleTargets = analyzeModuleTargets(model);
  const firstInvalidatingDependency = invalidateConsumers(
    moduleTargets.dependencies,
    inventory,
    providerUnit
  );
  return {
    sources,
    resolutionSources,
    repoRoot,
    adoption,
    providerPolicy,
    trusted,
    reviewedBoundaryChanges,
    baselineBytes,
    baseline,
    model,
    providerUnit,
    providerFiles,
    producerHarnessFiles,
    namedProofFiles,
    provenance,
    inventory,
    m4NativeInventory,
    providerEntries,
    directChanges,
    moduleTargets,
    firstInvalidatingDependency,
  };
}

export function prepareGuard(
  repoRoot,
  adoption = ADOPTION,
  providerPolicy = adoption === ADOPTION ? PROVIDER_UNIT_POLICY : undefined,
  workerInput
) {
  return completeGuardPreparation(
    prepareGuardModel(repoRoot, adoption, providerPolicy),
    workerInput
  );
}
