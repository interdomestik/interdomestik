import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KERNEL, pinsOf } from './tenant-guard-test-support.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import { createSeedTlsContext } from './tenant-guard/seed-tls-resolution.mjs';
import { APP_ALIASES, currentSources, workspacePackages } from './tenant-guard/sources.mjs';

export const TLS = 'packages/database/src/seed-target-tls.ts';
export const RUNTIME = 'packages/database/src/runtime.ts';
export const APP = 'apps/web/src/route.ts';
export const DB_PACKAGE = 'packages/database/package.json';
export const packageJson = extra =>
  JSON.stringify({ name: '@interdomestik/database', exports: { '.': './src/index.ts' }, ...extra });
const trusted = new Map(Object.entries(KERNEL));
const pins = pinsOf(trusted);

export function repositoryFixture(files, inspect = () => {}, resolution, prepare = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-tls-repo-'));
  try {
    for (const [file, text] of Object.entries({
      ...KERNEL,
      [DB_PACKAGE]: packageJson(),
      [TLS]: 'export const installSeedTlsClients = () => {};',
      ...files,
    })) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    }
    prepare(root);
    const sources = currentSources(root);
    const graph = createModuleGraph({
      sources,
      packages: workspacePackages(root),
      appAliases: APP_ALIASES,
      resolution,
    });
    const seedTls = createSeedTlsContext({
      repoRoot: root,
      sources,
      graph,
      appAliases: APP_ALIASES,
      resolution,
    });
    inspect({ seedTls, sources, root });
    return evaluate({ sources, trusted, graph, seedTls, legacyPins: pins, contracts: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export function refused(result, file, pattern = /seed-only/u) {
  assert.ok(
    result.violations.some(v => v.file === file && v.rule === 'R-a' && pattern.test(v.detail)),
    JSON.stringify(result.violations)
  );
}
