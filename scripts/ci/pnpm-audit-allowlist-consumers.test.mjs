import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

import { repoRoot } from './pnpm-audit-fixtures.mjs';

// pnpm audit reports a shared install once, under the first path its walker visits, so a
// path-scoped allowlist entry cannot see a new production route to the same install. This test
// pins, from the lockfile, every production edge that leads to each allowlisted vulnerable
// install: a new route or consumer fails here and needs a fresh reachability assessment.

const lockfile = yaml.load(readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8'));

function referenceValue(name, reference) {
  const value = typeof reference === 'string' ? reference : reference?.version;
  if (typeof value !== 'string' || value === '') throw new Error(`unreadable reference ${name}`);
  return value;
}

// pnpm 10's refToRelative for lockfile v9: `link:` is a workspace package (an importer), a
// scoped or `name@…` reference is the full target key, anything else is prefixed with the name.
function targetKey(name, value) {
  if (value.startsWith('link:')) return null;
  if (value[0] === '@') return value;
  const at = value.indexOf('@');
  if (at === -1) return `${name}@${value}`;
  const colon = value.indexOf(':');
  const bracket = value.indexOf('(');
  if ((colon === -1 || at < colon) && (bracket === -1 || at < bracket)) return value;
  return `${name}@${value}`;
}

function references(node) {
  return Object.entries({ ...node?.dependencies, ...node?.optionalDependencies }).map(
    ([name, reference]) => [name, referenceValue(name, reference)]
  );
}

// Production graph: importer and snapshot nodes, production and optional edges only. A
// workspace link stays an edge between importers, so a new route through it is visible.
function productionEdges(lock) {
  const edges = [];
  const seen = new Set();
  const queue = [];
  for (const [importer, node] of Object.entries(lock.importers)) {
    for (const [name, value] of references(node)) {
      const linked = path.posix.normalize(path.posix.join(importer, value.slice(5)));
      const child = targetKey(name, value) ?? `importer:${linked}`;
      edges.push([`importer:${importer}`, child]);
      if (!child.startsWith('importer:')) queue.push(child);
    }
  }
  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(key in lock.snapshots)) throw new Error(`unresolved production snapshot ${key}`);
    for (const [name, value] of references(lock.snapshots[key])) {
      const child = targetKey(name, value);
      if (child === null) continue;
      edges.push([key, child]);
      queue.push(child);
    }
  }
  return edges;
}

// Package identity without the peer suffix, which changes with unrelated peer upgrades.
const withoutPeers = key => key.replace(/\(.*$/su, '');

// Every production edge whose child is the target install or leads to it, as "parent > child".
function edgesLeadingTo(target, lock = lockfile) {
  const edges = productionEdges(lock);
  const leads = new Set([target]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [parent, child] of edges) {
      if (leads.has(child) && !leads.has(parent)) {
        leads.add(parent);
        grew = true;
      }
    }
  }
  const pinned = edges.filter(([, child]) => leads.has(child));
  return [...new Set(pinned.map(edge => edge.map(withoutPeers).join(' > ')))].sort();
}

// GHSA-fc5q-39xc-vjpf, assessed 2026-11-18: the Sentry build-time rollup plugins, the vitest
// test peer of better-auth and the next-intl file watcher. None takes request input.
test('the production routes to allowlisted picomatch installs are the assessed ones', () => {
  assert.deepEqual(edgesLeadingTo('picomatch@4.0.4'), [
    '@parcel/watcher@2.5.6 > picomatch@4.0.4',
    '@rollup/plugin-commonjs@28.0.1 > @rollup/pluginutils@5.4.0',
    '@rollup/plugin-commonjs@28.0.1 > fdir@6.5.0',
    '@rollup/plugin-commonjs@28.0.1 > picomatch@4.0.4',
    '@rollup/pluginutils@5.4.0 > picomatch@4.0.4',
    '@sentry/nextjs@10.75.2 > @rollup/plugin-commonjs@28.0.1',
    '@vitest/coverage-v8@4.1.11 > vitest@4.1.11',
    'better-auth@1.6.33 > vitest@4.1.11',
    'fdir@6.5.0 > picomatch@4.0.4',
    'importer:apps/web > @sentry/nextjs@10.75.2',
    'importer:apps/web > better-auth@1.6.33',
    'importer:apps/web > next-intl@4.14.5',
    'next-intl@4.14.5 > @parcel/watcher@2.5.6',
    'vitest@4.1.11 > @vitest/coverage-v8@4.1.11',
    'vitest@4.1.11 > picomatch@4.0.4',
  ]);
  assert.deepEqual(edgesLeadingTo('picomatch@4.0.7'), [
    '@vitest/coverage-v8@4.1.11 > vitest@4.1.11',
    '@vitest/mocker@4.1.11 > vite@8.3.3',
    'better-auth@1.6.33 > vitest@4.1.11',
    'fdir@6.5.0 > picomatch@4.0.7',
    'importer:apps/web > better-auth@1.6.33',
    'tinyglobby@0.2.17 > fdir@6.5.0',
    'tinyglobby@0.2.17 > picomatch@4.0.7',
    'vite@8.3.3 > picomatch@4.0.7',
    'vite@8.3.3 > tinyglobby@0.2.17',
    'vitest@4.1.11 > @vitest/coverage-v8@4.1.11',
    'vitest@4.1.11 > @vitest/mocker@4.1.11',
    'vitest@4.1.11 > tinyglobby@0.2.17',
  ]);
});

const assessed = {
  importers: { web: { dependencies: { tool: { version: '1.0.0' } } } },
  snapshots: {
    'tool@1.0.0': { dependencies: { fdir: '6.5.0(picomatch@4.0.4)' } },
    'fdir@6.5.0(picomatch@4.0.4)': { dependencies: { picomatch: '4.0.4' } },
    'picomatch@4.0.4': {},
  },
};
const baseline = edgesLeadingTo('picomatch@4.0.4', assessed);

function variant(change) {
  const lock = structuredClone(assessed);
  change(lock);
  return edgesLeadingTo('picomatch@4.0.4', lock);
}

test('references resolve as pnpm 10 resolves them', () => {
  const lock = {
    importers: {
      web: {
        dependencies: {
          zip: { version: '7zip-bin@5.2.0' },
          local: { version: 'file:vendor/local' },
          scoped: { version: '@scope/pkg@1.0.0(peer@2.0.0)' },
          plain: { version: '1.0.0(peer@2.0.0)' },
        },
      },
    },
    snapshots: {
      '7zip-bin@5.2.0': { dependencies: { picomatch: '4.0.4' } },
      'local@file:vendor/local': { dependencies: { picomatch: '4.0.4' } },
      '@scope/pkg@1.0.0(peer@2.0.0)': { dependencies: { picomatch: '4.0.4' } },
      'plain@1.0.0(peer@2.0.0)': { dependencies: { picomatch: '4.0.4' } },
      'picomatch@4.0.4': {},
    },
  };
  assert.deepEqual(edgesLeadingTo('picomatch@4.0.4', lock), [
    '7zip-bin@5.2.0 > picomatch@4.0.4',
    '@scope/pkg@1.0.0 > picomatch@4.0.4',
    'importer:web > 7zip-bin@5.2.0',
    'importer:web > @scope/pkg@1.0.0',
    'importer:web > local@file:vendor/local',
    'importer:web > plain@1.0.0',
    'local@file:vendor/local > picomatch@4.0.4',
    'plain@1.0.0 > picomatch@4.0.4',
  ]);
});

test('new routes, aliases and direct dependencies change the pinned edges', () => {
  assert.deepEqual(baseline, [
    'fdir@6.5.0 > picomatch@4.0.4',
    'importer:web > tool@1.0.0',
    'tool@1.0.0 > fdir@6.5.0',
  ]);
  const changes = {
    'new root to an assessed install': lock => {
      lock.importers.web.optionalDependencies = { other: { version: '2.0.0' } };
      lock.snapshots['other@2.0.0'] = { dependencies: { fdir: '6.5.0(picomatch@4.0.4)' } };
    },
    'aliased parent': lock => {
      lock.importers.web.dependencies.alias = { version: 'renamed@3.0.0' };
      lock.snapshots['renamed@3.0.0'] = { dependencies: { fdir: '6.5.0(picomatch@4.0.4)' } };
    },
    'aliased picomatch': lock => {
      lock.snapshots['tool@1.0.0'].dependencies.pm = 'picomatch@4.0.4';
    },
    'direct importer dependency': lock => {
      lock.importers.web.dependencies.picomatch = { version: '4.0.4' };
    },
  };
  for (const [name, change] of Object.entries(changes)) {
    assert.notDeepEqual(variant(change), baseline, name);
  }
  const linkedBase = variant(lock => {
    lock.importers.lib = { dependencies: { tool: { version: '1.0.0' } } };
  });
  const linked = variant(lock => {
    lock.importers.lib = { dependencies: { tool: { version: '1.0.0' } } };
    lock.importers.web.dependencies.lib = { version: 'link:../lib' };
  });
  assert.ok(linked.includes('importer:web > importer:lib'), 'workspace link edge');
  assert.notDeepEqual(linked, linkedBase, 'new workspace route');
  const devOnly = variant(lock => {
    lock.importers.web.devDependencies = { dev: { version: '1.0.0' } };
    lock.snapshots['dev@1.0.0'] = { dependencies: { picomatch: '4.0.4' } };
  });
  assert.deepEqual(devOnly, baseline);
  assert.throws(
    () => variant(lock => delete lock.snapshots['fdir@6.5.0(picomatch@4.0.4)']),
    /unresolved production snapshot fdir@6\.5\.0/u
  );
});
