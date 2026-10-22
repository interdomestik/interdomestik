import { proofReport } from './db-access-proof-report.mjs';
import { runtimeProofObligations } from './db-access-runtime-obligations.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import {
  providerUnitResolverSnapshot,
  verifyProviderUnitSource,
  providerUnitAnalysisModel,
} from './db-access-provider-unit-source.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ADOPTION } from './db-access-adoption.mjs';
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
import { collectInventory, isUnsafe } from './db-access-inventory.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { writeGuardReport } from './db-access-report.mjs';
import { analyzeModuleTargets, rootDiagnostics } from './db-access-root-diagnostics.mjs';

const BASELINE = 'scripts/ci/db-access-baseline.json';
const publicEntry = entry =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith('_')));

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
export function evaluateGuard(
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
  // Keep the complete pre-amendment operation inventory, including DB-looking mock
  // handles. The named boundary changes proof obligations, never inventory visibility.
  const inventoryProvenance = providerUnit?.namedProofFiles.length
    ? createProvenance(providerUnitAnalysisModel(model, providerUnit, true))
    : provenance;
  const inventory = collectInventory(model, inventoryProvenance, trusted);
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
  const graph = inspectChangedEdges(model, provenance, inventory, adoption.critical, providerUnit);
  // A test filename never exempts an inventoried operation, so DB-looking mocks stay unsafe
  // until separately source-proved precision exists.
  const newEntries = inventory.entries.filter(entry => !entry.historicalDebt);
  // A transaction proves connection context, not equivalent owner/role/admission controls.
  // Existing scoped files are immutable at executable granularity in this epoch;
  // deletion and ambient-to-context remediation remain possible.
  let priorScoped = new Set();
  if ([...inventory.changed].some(file => trusted.has(file))) {
    const beforeModel = createSourceModel(trusted, trusted);
    const beforeProvenance = createProvenance(beforeModel);
    const before = collectInventory(beforeModel, beforeProvenance, trusted);
    // An incomplete adoption classification cannot erase the prior scoped-control obligation.
    for (const reason of beforeProvenance.analysisUnknown) {
      graph.incomplete.push({ file: '<adoption-analysis>', reason, occurrences: 1 });
      graph.incompleteRawCount += 1;
    }
    priorScoped = new Set(
      before.entries
        .filter(entry => entry.tenantPosture === 'tenant-context')
        .map(entry => entry.file)
    );
  }
  const changedScopedControls = newEntries.filter(
    entry => priorScoped.has(entry.file) && !providerFiles.has(entry.file)
  );
  // A single operation may be reached from several changed roots. Keep every witness in the
  // diagnostic report even though the verdict counts the operation identity only once.
  const mountsByIdentity = new Map();
  for (const entry of graph.failures) {
    const mounts = mountsByIdentity.get(entry.identity) ?? new Set();
    mounts.add(entry.mountedFrom);
    mountsByIdentity.set(entry.identity, mounts);
  }
  const failures = new Map();
  for (const entry of [
    ...newEntries.filter(
      entry =>
        !providerFiles.has(entry.file) &&
        !producerHarnessFiles.has(entry.file) &&
        !namedProofFiles.has(entry.file) &&
        isUnsafe(entry)
    ),
    ...graph.failures,
    ...changedScopedControls.map(entry => ({
      ...entry,
      reason: 'existing scoped executable controls changed; root epoch cannot certify equivalence',
    })),
  ])
    failures.set(entry.identity, entry);
  const { messageObligations, observedMounts, crmObligations } = runtimeProofObligations({
    providerUnit,
    failures,
    graph,
    directChanges,
    firstInvalidatingDependency,
    newEntries,
    scannedCount: inventory.entries.length,
    baselineCount: baseline.entries.length,
  });
  const failingNewEntries = [...failures.values()].map(entry => {
    const publicFailure = publicEntry(entry);
    const mounts = mountsByIdentity.get(entry.identity);
    if (mounts) publicFailure.mountedFromAll = [...mounts];
    return publicFailure;
  });
  const counts = {};
  for (const entry of inventory.entries)
    counts[entry.tenantPosture] = (counts[entry.tenantPosture] ?? 0) + 1;
  let status = 'pass';
  if (crmObligations.remaining.length) status = 'incomplete';
  else if (failingNewEntries.length) status = 'fail';
  return {
    status,
    ...(providerUnit
      ? {
          providerUnit: {
            ...providerUnit,
            runtimeProducerRequired: providerPolicy.runtimeEnforcement,
            ...proofReport({
              inventory,
              namedProofFiles,
              messageObligations,
              crmObligations,
              producerHarnessFiles,
              providerEntries,
              providerPolicy,
            }),
          },
        }
      : {}),
    trustedCommit: adoption.commit,
    trustedTree: adoption.tree,
    historicalBaselineSha256: digest(baselineBytes),
    baselineCount: baseline.entries.length,
    scannedCount: inventory.entries.length,
    newCount: newEntries.length,
    failingNewCount: failingNewEntries.length,
    newEntries: newEntries.map(publicEntry),
    failingNewEntries,
    mountEvidence: observedMounts,
    rootDiagnostics: rootDiagnostics(moduleTargets, directChanges, firstInvalidatingDependency),
    incomplete: graph.incomplete,
    unresolvedIncomplete: crmObligations.remaining,
    incompleteRawCount: graph.incompleteRawCount,
    reviewedBoundaryChanges,
    counts: { byTenantPosture: counts },
    limits: [
      ...(providerUnit
        ? [
            'Provider source authentication is static only; the immutable external workflow must execute the bound runtime producer before admission. No receipt or green check name authorizes this transition.',
          ]
        : []),
      'Executable file changes conservatively invalidate ambient debt, including unrelated UI text/classes; transaction remediation or separately reviewed precision work is required.',
      'Bounded static evidence, not runtime RLS or general JavaScript proof.',
      'Tenant/owner values and authorization equivalence, including relocated scoped code or changed caller values, are not proved; arbitrary external monkeypatching and non-awaited async completion remain outside the claim.',
      'Consumer invalidation is intentionally file-coarse and may overblock dependency changes.',
      'Unknown, recursive, computed and escaped local executable edges fail closed.',
      'Existing scoped executable changes require separately reviewed precision/epoch evolution; a canonical transaction alone does not certify authorization equivalence.',
      'Root epoch is immutable; helper/policy evolution requires a separately reviewed implementation.',
    ],
  };
}

export function runGuardCli({ repoRoot, argv = [], adoption = ADOPTION }) {
  let reportPath = 'tmp/db-access-guard/report.json';
  let report;
  try {
    if (Object.keys(process.env).some(key => /^(DB_ACCESS_GUARD_|TENANT_GUARD_)/u.test(key)))
      throw new Error('incomplete: unsupported guard environment override');
    for (const arg of argv) {
      if (arg === '--help' || arg === '-h') {
        console.log('Usage: check-db-access-guard.mjs [--report=tmp/path.json]');
        return 0;
      }
      if (!arg.startsWith('--report=') || !arg.slice(9).startsWith('tmp/') || arg.includes('..')) {
        throw new Error(`incomplete: unsupported guard override ${arg}`);
      }
      reportPath = arg.slice(9);
    }
    report = evaluateGuard(repoRoot, adoption);
  } catch (error) {
    report = {
      status: 'incomplete',
      trustedCommit: adoption.commit,
      trustedTree: adoption.tree,
      incomplete: [{ reason: error instanceof Error ? error.message : String(error) }],
      failingNewEntries: [],
    };
  }
  const output = path.join(repoRoot, reportPath);
  let directory = repoRoot;
  for (const segment of reportPath.split('/').slice(0, -1)) {
    directory = path.join(directory, segment);
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink())
      throw new Error('incomplete: report path symlink');
  }
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())
    throw new Error('incomplete: report file symlink');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    report = writeGuardReport(output, report, adoption);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (report.status === 'pass')
    console.log(
      `DB access guard passed: ${report.scannedCount} operations; historical baseline ${report.baselineCount}.`
    );
  else {
    console.error(
      `DB access guard ${report.status}: sensitive new direct DB access or incomplete proof.`
    );
    for (const entry of report.failingNewEntries)
      console.log(`${entry.file}:${entry.line} ${entry.method} [${entry.tenantPosture}]`);
    for (const item of report.incomplete ?? []) console.error(`${item.file ?? ''} ${item.reason}`);
  }
  console.log(`Report: ${reportPath}`);
  return report.status === 'pass' ? 0 : 1;
}
