#!/usr/bin/env node
// Tenant guard entry point. The protected workflow supplies all object identities explicitly.
import { performance } from 'node:perf_hooks';
import { bundlerCheckoutProblem } from './tenant-guard/bundler-checkout.mjs';
import { KERNEL_ANCHOR } from './tenant-guard/manifest.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { resolutionConfig, workspaceGlobViolations } from './tenant-guard/resolution.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import {
  APP_ALIASES,
  checkoutDiscrepancy,
  currentSources,
  gitAncestor,
  gitIdentity,
  readSchemaTree,
  trustedSources,
  workspacePackages,
} from './tenant-guard/sources.mjs';
import { createSeedTlsContext } from './tenant-guard/seed-tls-resolution.mjs';
import { TRUSTED } from './tenant-guard/trusted.mjs';

// Tenant guard S″: capability confinement over a finite privileged boundary, with legacy forms
// admitted only where unchanged from the trusted tree (A5 S3 with A5-r1 C1–C3).
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? '') : null;
};
const repoRoot = option('--root') ?? process.cwd();
// `--trusted <commit>` is a local measurement override; without it the owner pin is mandatory and
// is used only as an exact commit and tree pair.
const trustedRef = option('--trusted') ? { commit: option('--trusted'), tree: null } : TRUSTED;
const HEX = /^[0-9a-f]{40}$/u;
if (
  !HEX.test(trustedRef.commit ?? '') ||
  (!option('--trusted') && !HEX.test(trustedRef.tree ?? ''))
) {
  console.error(
    'tenant-guard: incomplete: trusted comparator is not pinned to an exact commit and tree'
  );
  process.exit(2);
}
const started = performance.now();
const { identity, schemaAdmission } = admissionInputs();
const { sources, resolution, packages } = checkoutInputs(schemaAdmission);
const trusted = trustedSources(repoRoot, trustedRef);
const graph = createModuleGraph({
  sources,
  packages,
  appAliases: APP_ALIASES,
  resolution,
});
const seedTls = createSeedTlsContext({
  repoRoot,
  sources,
  graph,
  resolution,
  appAliases: APP_ALIASES,
});
const result = evaluate({ sources, trusted, graph, seedTls, schemaAdmission });
result.violations.unshift(
  ...resolution.violations,
  // Bundler configs and their local import closures are bound by the reviewed resolver state
  // inside schema admission (rules-resolver-state.mjs), on the authenticated base and candidate.
  ...workspaceGlobViolations(repoRoot)
);
const elapsedMs = Math.round(performance.now() - started);
const report = {
  trusted: trustedRef,
  identity,
  schemaAdmission: result.schemaAdmission,
  legacyDigests: result.legacyDigests,
  legacyExactDigests: result.legacyExactDigests,
  elapsedMs,
  telemetry: result.telemetry,
  violations: result.violations,
};
if (args.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  for (const violation of result.violations) {
    console.log(
      `${violation.rule} ${violation.file}:${violation.line} [${violation.unit}] ${violation.detail}`
    );
  }
  console.log(
    `tenant-guard: ${result.violations.length} violation(s); ${JSON.stringify(result.telemetry)}; ${elapsedMs} ms`
  );
}
process.exitCode = result.violations.length > 0 ? 1 : 0;

function admissionInputs() {
  const roles = ['merge', 'base', 'anchor'];
  const identity = Object.fromEntries(
    roles.map(role => [
      role,
      {
        commit: option(`--${role}-commit`),
        tree: option(`--${role}-tree`),
      },
    ])
  );
  const explicit = Object.values(identity).some(ref => ref.commit !== null || ref.tree !== null);
  let labels = 'local';
  try {
    if (!explicit) {
      // Local audits and verification compare tracked HEAD with origin/main by default.
      // Use --base <revision> for a known earlier base. The scan still checks checkout bytes.
      labels = 'merge';
      identity.merge = gitIdentity(repoRoot, 'HEAD');
      labels = 'base';
      identity.base = gitIdentity(repoRoot, option('--base') ?? 'refs/remotes/origin/main');
      identity.anchor = KERNEL_ANCHOR;
    }
    if (
      identity.anchor.commit !== KERNEL_ANCHOR.commit ||
      identity.anchor.tree !== KERNEL_ANCHOR.tree
    )
      return {
        identity,
        schemaAdmission: { reason: 'anchor arguments differ from the owner pin' },
      };
    labels = 'anchor';
    const anchor = readSchemaTree(repoRoot, identity.anchor, labels);
    labels = 'base';
    const base =
      identity.base.commit === identity.anchor.commit && identity.base.tree === identity.anchor.tree
        ? anchor
        : readSchemaTree(repoRoot, identity.base, labels);
    labels = 'candidate';
    const candidate =
      identity.merge.commit === identity.base.commit && identity.merge.tree === identity.base.tree
        ? base
        : readSchemaTree(repoRoot, identity.merge, labels);
    let reason = null;
    if (!gitAncestor(repoRoot, identity.anchor.commit, identity.base.commit))
      reason = 'anchor is not an ancestor of base';
    else if (!gitAncestor(repoRoot, identity.base.commit, identity.merge.commit))
      reason = 'base is not an ancestor of candidate';
    else if (
      explicit &&
      gitIdentity(repoRoot, `${identity.merge.commit}^1`).commit !== identity.base.commit
    )
      reason = 'base is not the merge first parent';
    return { identity, schemaAdmission: { anchor, base, candidate, reason } };
  } catch (error) {
    const reason =
      error.code || !(error instanceof Error) ? `${labels}: Git data unavailable` : error.message;
    return { identity, schemaAdmission: { reason } };
  }
}

function checkoutInputs(admission) {
  try {
    const sources = currentSources(repoRoot);
    const resolution = resolutionConfig(repoRoot);
    const packages = workspacePackages(repoRoot);
    if (!admission.reason && admission.candidate)
      admission.reason = checkoutDiscrepancy(repoRoot, sources, admission.candidate);
    if (!admission.reason && admission.candidate)
      admission.reason = bundlerCheckoutProblem(repoRoot, admission.candidate);
    return { sources, resolution, packages };
  } catch (error) {
    admission.reason ??= error.code
      ? 'checkout: source or resolver data unavailable'
      : error.message;
    return (
      admission.candidate ?? {
        sources: new Map(),
        packages: new Map(),
        resolution: { pathRules: [], baseRoots: [], violations: [] },
      }
    );
  }
}
