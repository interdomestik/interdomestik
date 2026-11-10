#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import {
  bundlerConfigViolations,
  resolutionConfig,
  workspaceGlobViolations,
} from './tenant-guard/resolution.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import {
  APP_ALIASES,
  currentSources,
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
  return index >= 0 ? args[index + 1] : null;
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
const sources = currentSources(repoRoot);
const trusted = trustedSources(repoRoot, trustedRef);
const resolution = resolutionConfig(repoRoot);
const graph = createModuleGraph({
  sources,
  packages: workspacePackages(repoRoot),
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
const result = evaluate({ sources, trusted, graph, seedTls });
result.violations.unshift(
  ...resolution.violations,
  ...workspaceGlobViolations(repoRoot),
  ...bundlerConfigViolations(repoRoot, trustedRef.commit)
);
const elapsedMs = Math.round(performance.now() - started);
const report = {
  trusted: trustedRef,
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
