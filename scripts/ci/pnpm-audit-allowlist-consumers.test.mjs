import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

import { repoRoot } from './pnpm-audit-fixtures.mjs';

// pnpm audit reports a shared install once, under the first path its walker visits, so a
// path-scoped allowlist entry cannot see a new production consumer of the same install. This
// test pins the production consumers of each allowlisted vulnerable install, read from the
// lockfile: a new consumer fails here and needs a fresh reachability assessment.

const lockfile = yaml.load(readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8'));

function packageName(key) {
  const at = key.indexOf('@', key.startsWith('@') ? 1 : 0);
  return key.slice(0, at);
}

function dependencyEntries(node) {
  return Object.entries({ ...node?.dependencies, ...node?.optionalDependencies });
}

// Snapshot keys reachable through production and optional dependencies of every importer.
function productionSnapshots(lock = lockfile) {
  const seen = new Set();
  const seenImporters = new Set();
  const queue = [];
  const visitImporter = importer => {
    if (seenImporters.has(importer)) return;
    seenImporters.add(importer);
    for (const [name, spec] of dependencyEntries(lock.importers[importer])) {
      const version = typeof spec === 'string' ? spec : spec.version;
      if (version.startsWith('link:')) {
        visitImporter(path.posix.normalize(path.posix.join(importer, version.slice(5))));
      } else {
        queue.push(`${name}@${version}`);
      }
    }
  };
  Object.keys(lock.importers).forEach(visitImporter);
  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [name, version] of dependencyEntries(lock.snapshots[key])) {
      if (!String(version).startsWith('link:')) queue.push(`${name}@${version}`);
    }
  }
  return seen;
}

function productionConsumers(dependency, version, lock = lockfile) {
  const consumers = new Set();
  for (const key of productionSnapshots(lock)) {
    const pinned = dependencyEntries(lock.snapshots[key]).some(
      ([name, resolved]) => name === dependency && resolved === version
    );
    if (pinned) consumers.add(packageName(key));
  }
  return [...consumers].sort();
}

// GHSA-fc5q-39xc-vjpf, assessed 2026-11-18: the Sentry build-time rollup plugins
// (plugin-commonjs, pluginutils, fdir), the vitest test peer of better-auth (vitest, tinyglobby,
// vite, fdir) and the file watcher of next-intl (@parcel/watcher). None takes request input.
test('the production consumers of allowlisted picomatch installs are the assessed ones', () => {
  assert.deepEqual(productionConsumers('picomatch', '4.0.4'), [
    '@parcel/watcher',
    '@rollup/plugin-commonjs',
    '@rollup/pluginutils',
    'fdir',
    'vitest',
  ]);
  assert.deepEqual(productionConsumers('picomatch', '4.0.7'), ['fdir', 'tinyglobby', 'vite']);
});

test('a new production consumer is detected, through links too, and dev-only consumers are not', () => {
  const lock = {
    importers: {
      'apps/web': { dependencies: { '@scope/lib': { version: 'link:../../packages/lib' } } },
      'packages/lib': { dependencies: { 'glob-user': { version: '1.0.0' } } },
      tooling: { devDependencies: { 'dev-only': { version: '1.0.0' } } },
    },
    snapshots: {
      'glob-user@1.0.0': { optionalDependencies: { picomatch: '4.0.4' } },
      'dev-only@1.0.0': { dependencies: { picomatch: '4.0.4' } },
      'picomatch@4.0.4': {},
    },
  };
  assert.deepEqual(productionConsumers('picomatch', '4.0.4', lock), ['glob-user']);
});
