import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
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

const BASELINE = 'scripts/ci/db-access-baseline.json';
const publicEntry = entry =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith('_')));

function invalidateConsumers(model, inventory) {
  let changed = true;
  const imports = new Map();
  for (const [file, sf] of model.parsed) {
    const dependencies = new Set();
    model.walk(sf, node => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const target = model.moduleFile(node.moduleSpecifier.text, file);
        if (target && !node.isTypeOnly && !node.importClause?.isTypeOnly) dependencies.add(target);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const target = model.moduleFile(node.arguments[0].text, file);
        if (target) dependencies.add(target);
      }
    });
    imports.set(file, dependencies);
  }
  while (changed) {
    changed = false;
    for (const [file, dependencies] of imports) {
      if (
        !inventory.changed.has(file) &&
        [...dependencies].some(target => inventory.changed.has(target))
      ) {
        inventory.changed.add(file);
        changed = true;
      }
    }
  }
  for (const entry of inventory.entries)
    if (inventory.changed.has(entry.file)) entry.historicalDebt = false;
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
  invalidateConsumers(model, inventory);
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
  const failingNewEntries = [...failures.values()].map(publicEntry);
  const counts = {};
  for (const entry of inventory.entries)
    counts[entry.tenantPosture] = (counts[entry.tenantPosture] ?? 0) + 1;
  return {
    status: graph.incomplete.length ? 'incomplete' : failingNewEntries.length ? 'fail' : 'pass',
    trustedCommit: adoption.commit,
    trustedTree: adoption.tree,
    historicalBaselineSha256: digest(baselineBytes),
    baselineCount: baseline.entries.length,
    scannedCount: inventory.entries.length,
    newCount: newEntries.length,
    failingNewCount: failingNewEntries.length,
    newEntries: newEntries.map(publicEntry),
    failingNewEntries,
    incomplete: graph.incomplete,
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
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
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
