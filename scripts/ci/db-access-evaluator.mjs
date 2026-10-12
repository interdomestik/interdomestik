import fs from 'node:fs';
import path from 'node:path';
import { ADOPTION } from './db-access-adoption.mjs';
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

function compactIncomplete(items) {
  const firstByKey = new Map();
  const compact = [];
  for (const item of items) {
    const key = JSON.stringify([item.file, item.reason]);
    const prior = firstByKey.get(key);
    if (prior) {
      prior.occurrences += 1;
    } else {
      const first = { ...item, occurrences: 1 };
      firstByKey.set(key, first);
      compact.push(first);
    }
  }
  return compact;
}

function invalidateConsumers(dependenciesByFile, inventory) {
  let changed = true;
  const firstInvalidatingDependency = new Map();
  while (changed) {
    changed = false;
    for (const [file, dependencies] of dependenciesByFile) {
      const witness = !inventory.changed.has(file)
        ? [...dependencies].find(target => inventory.changed.has(target))
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

function mountEvidence(directChanges, firstInvalidatingDependency, graph, incomplete) {
  const paths = new Set([...directChanges, ...firstInvalidatingDependency.keys()]);
  for (const failure of graph.failures) paths.add(failure.mountedFrom);
  const files = [...paths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const ids = new Map(files.map((file, id) => [file, id]));
  const roots = files.map((file, id) => {
    const dependency = firstInvalidatingDependency.get(file);
    return {
      id,
      file,
      changeKind: directChanges.has(file) ? 'runtime-source' : 'runtime-consumer',
      ...(dependency ? { firstInvalidatingDependencyId: ids.get(dependency) } : {}),
    };
  });
  const operations = new Map();
  for (const failure of graph.failures) {
    const rootsForOperation = operations.get(failure.identity) ?? new Set();
    rootsForOperation.add(ids.get(failure.mountedFrom));
    operations.set(failure.identity, rootsForOperation);
  }
  return {
    version: 1,
    analysisIncomplete: incomplete,
    roots,
    operations: [...operations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([identity, observedRootIds]) => ({
        identity,
        observedRootIds: [...observedRootIds].sort((left, right) => left - right),
      })),
  };
}

// Test harness may supply a real pinned fixture epoch; no CLI option exposes it.
export function evaluateGuard(repoRoot, adoption = ADOPTION) {
  const trusted = authenticateSnapshot(repoRoot, adoption);
  const reviewedBoundaryChanges = boundaryChanges(repoRoot, adoption);
  const baselineBytes = fs.readFileSync(path.join(repoRoot, BASELINE));
  if (digest(baselineBytes) !== adoption.files[BASELINE])
    throw new Error('incomplete: historical baseline modified');
  const baseline = JSON.parse(baselineBytes);
  if (!Array.isArray(baseline.entries)) throw new Error('incomplete: invalid historical baseline');
  const closureChanges = reviewedBoundaryChanges.filter(file => adoption.critical.includes(file));
  if (closureChanges.length)
    throw new Error(`incomplete: critical tenant helper changed: ${closureChanges.join(', ')}`);
  const sources = candidateSources(repoRoot);
  verifyResolverBoundary(repoRoot, trusted);
  // Candidate package/config files never define resolver authority.
  for (const [file, content] of trusted)
    if (file.endsWith('/package.json')) sources.set(file, content);
  const model = createSourceModel(sources, trusted);
  const provenance = createProvenance(model);
  const inventory = collectInventory(model, provenance, trusted);
  const directChanges = new Set(inventory.changed);
  const moduleTargets = analyzeModuleTargets(model);
  const firstInvalidatingDependency = invalidateConsumers(moduleTargets.dependencies, inventory);
  const graph = inspectChangedEdges(model, provenance, inventory, adoption.critical);
  const newEntries = inventory.entries.filter(entry => !entry.historicalDebt);
  // A transaction proves connection context, not equivalent owner/role/admission controls.
  // Existing scoped files are immutable at executable granularity in this epoch;
  // deletion and ambient-to-context remediation remain possible.
  let priorScoped = new Set();
  if ([...inventory.changed].some(file => trusted.has(file))) {
    const beforeModel = createSourceModel(trusted, trusted);
    const before = collectInventory(beforeModel, createProvenance(beforeModel), trusted);
    priorScoped = new Set(
      before.entries
        .filter(entry => entry.tenantPosture === 'tenant-context')
        .map(entry => entry.file)
    );
  }
  const changedScopedControls = newEntries.filter(entry => priorScoped.has(entry.file));
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
    ...newEntries.filter(isUnsafe),
    ...graph.failures,
    ...changedScopedControls.map(entry => ({
      ...entry,
      reason: 'existing scoped executable controls changed; root epoch cannot certify equivalence',
    })),
  ])
    failures.set(entry.identity, entry);
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
  if (graph.incomplete.length) status = 'incomplete';
  else if (failingNewEntries.length) status = 'fail';
  return {
    status,
    trustedCommit: adoption.commit,
    trustedTree: adoption.tree,
    historicalBaselineSha256: digest(baselineBytes),
    baselineCount: baseline.entries.length,
    scannedCount: inventory.entries.length,
    newCount: newEntries.length,
    failingNewCount: failingNewEntries.length,
    newEntries: newEntries.map(publicEntry),
    failingNewEntries,
    mountEvidence: mountEvidence(
      directChanges,
      firstInvalidatingDependency,
      graph,
      graph.incomplete.length > 0
    ),
    rootDiagnostics: rootDiagnostics(moduleTargets, directChanges, firstInvalidatingDependency),
    incomplete: compactIncomplete(graph.incomplete),
    incompleteRawCount: graph.incomplete.length,
    reviewedBoundaryChanges,
    counts: { byTenantPosture: counts },
    limits: [
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
