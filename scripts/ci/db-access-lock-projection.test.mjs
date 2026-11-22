// The G0 lockfile projection: only well-formed first-party workspace links leave the pin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LOCK_PROJECTION_ID, lockImporters, lockProjection } from './db-access-lock-projection.mjs';
import { rootDir } from './db-access-guard-test-utils.mjs';

// A fixed input in the real lockfile's shape: mutation cases must not depend on the checkout,
// whose lockfile may already hold the link a case adds.
const lock = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

overrides:
  next: 16.4.5

patchedDependencies:
  next@16.4.5:
    hash: 0123abcd
    path: patches/next@16.4.5.patch

importers:

  .:
    devDependencies:
      '@commitlint/cli':
        specifier: ^20.5.3
        version: 20.5.3

  apps/web:
    dependencies:
      '@interdomestik/database':
        specifier: workspace:*
        version: link:../../packages/database
      next:
        specifier: 16.4.5
        version: 16.4.5(patch_hash=0123abcd)

  packages/database:
    dependencies:
      drizzle-orm:
        specifier: ^0.45.2
        version: 0.45.2(pg@8.23.0)

  packages/domain-activities:
    dependencies:
      '@interdomestik/database':
        specifier: workspace:*
        version: link:../database
      zod:
        specifier: ^4.0.0
        version: 4.0.0

  packages/domain-claims:
    dependencies:
      '@interdomestik/database':
        specifier: workspace:*
        version: link:../database

  packages/domain-communications:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/domain-privacy:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/shared-auth:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/shared-utils:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

packages:

  '@commitlint/cli@20.5.3':
    resolution: {integrity: sha512-a}

snapshots:

  '@commitlint/cli@20.5.3': {}
`;
const digest = text => lockProjection(Buffer.from(text, 'utf8')).sha256;
const base = digest(lock);
const refused = { message: /^incomplete: lockfile projection /u };

// Insert lines directly after `header` inside `importer`; the header line must exist once there.
function insertAfter(text, importer, header, lines) {
  const start = text.indexOf(`\n  ${importer}:\n`);
  assert.ok(start >= 0, importer);
  // Importers are separated by one blank line; the section ends at the next one.
  const section = text.slice(start, text.indexOf('\n\n', start + 1) + 1);
  const at = section.indexOf(`\n${header}\n`);
  assert.ok(at >= 0, `${importer} ${header}`);
  const cut = start + at + header.length + 2;
  return text.slice(0, cut) + lines.map(line => `${line}\n`).join('') + text.slice(cut);
}
const link = (name, target, specifier = 'workspace:*') => [
  `      '@interdomestik/${name}':`,
  `        specifier: ${specifier}`,
  `        version: ${target}`,
];
const addLink = (text, importer, block, name, target) =>
  insertAfter(text, importer, `    ${block}:`, link(name, target));
const replaceOnce = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `exactly one ${from}`);
  return text.replace(from, to);
};
const COMMITLINT = "      '@commitlint/cli':\n        specifier: ^20.5.3\n";

// A packages/* importer with a dependencies block and a package it does not link yet.
function unlinkedPair(text) {
  const importers = lockImporters(Buffer.from(text, 'utf8'));
  const targets = [...importers.keys()].filter(name => name.startsWith('packages/'));
  for (const [name, blocks] of importers) {
    if (!name.startsWith('packages/') || !blocks.has('dependencies')) continue;
    const linked = new Set([...blocks.values()].flatMap(entries => [...entries.keys()]));
    const target = targets.find(
      other => other !== name && !linked.has(`@interdomestik/${path.posix.basename(other)}`)
    );
    if (target) return { importer: name, target: path.posix.basename(target) };
  }
  return assert.fail('no importer can take a new first-party link');
}

test('the live lockfile: versioned, deterministic, and a new first-party link keeps its digest', () => {
  const live = fs.readFileSync(path.join(rootDir, 'pnpm-lock.yaml'), 'utf8');
  assert.equal(LOCK_PROJECTION_ID, 'interdomestik-g0-lock-projection-v1');
  const own = digest(live);
  assert.match(own, /^[0-9a-f]{64}$/u);
  assert.equal(digest(live), own);
  const importers = lockImporters(Buffer.from(live, 'utf8'));
  assert.ok(importers.has('.') && importers.has('apps/web') && importers.has('packages/database'));
  const { importer, target } = unlinkedPair(live);
  const linked = addLink(live, importer, 'dependencies', target, `link:../${target}`);
  assert.notEqual(linked, live);
  assert.equal(digest(linked), own);
});

test('accepted: the exact first-party links of #2113 and #2114', () => {
  const pr2113 = addLink(
    lock,
    'packages/domain-activities',
    'dependencies',
    'shared-auth',
    'link:../shared-auth'
  );
  const pr2114 = addLink(
    lock,
    'packages/domain-claims',
    'dependencies',
    'domain-communications',
    'link:../domain-communications'
  );
  assert.equal(digest(pr2113), base);
  assert.equal(digest(pr2114), base);
});

test('accepted: removal, a first block, a block move, root and web paths', () => {
  const existing = link('database', 'link:../database').join('\n');
  const activities = lock.indexOf('\n  packages/domain-activities:\n');
  const at = lock.indexOf(`\n${existing}\n`, activities);
  assert.ok(at > activities);
  const removed = lock.slice(0, at) + lock.slice(at + existing.length + 1);
  assert.equal(digest(removed), base, 'removed link');
  // shared-auth has only devDependencies: the new dependencies block disappears in the projection.
  const firstBlock = insertAfter(lock, 'packages/shared-auth', '  packages/shared-auth:', [
    '    dependencies:',
    ...link('shared-utils', 'link:../shared-utils'),
  ]);
  assert.equal(digest(firstBlock), base, 'first dependencies block');
  const moved = insertAfter(removed, 'packages/domain-activities', '        version: 4.0.0', [
    '    devDependencies:',
    ...link('database', 'link:../database'),
  ]);
  assert.equal(digest(moved), base, 'moved between blocks');
  assert.equal(
    digest(addLink(lock, '.', 'devDependencies', 'shared-utils', 'link:packages/shared-utils')),
    base,
    'root importer'
  );
  assert.equal(
    digest(
      addLink(
        lock,
        'apps/web',
        'dependencies',
        'domain-privacy',
        'link:../../packages/domain-privacy'
      )
    ),
    base,
    'web importer'
  );
});

test('refused by digest: external, override, patch, settings and order changes', () => {
  const cases = {
    'external version': replaceOnce(lock, 'version: 4.0.0\n', 'version: 4.0.1\n'),
    'external specifier': replaceOnce(lock, COMMITLINT, COMMITLINT.replace('20.5.3', '20.5.4')),
    override: replaceOnce(lock, '\noverrides:\n', '\noverrides:\n  evil: 1.0.0\n'),
    patch: replaceOnce(lock, 'path: patches/next@16.4.5.patch', 'path: patches/next@16.4.6.patch'),
    setting: replaceOnce(lock, '\nsettings:\n', '\nsettings:\n  injectWorkspacePackages: true\n'),
    'first-party key under packages': replaceOnce(
      lock,
      '\npackages:\n',
      "\npackages:\n\n  '@interdomestik/evil@1.0.0':\n    resolution: {integrity: sha512-x}\n"
    ),
    'external link entry': insertAfter(lock, 'apps/web', '    dependencies:', [
      '      left-pad:',
      '        specifier: link:../left-pad',
      '        version: link:../left-pad',
    ]),
    'link plus external change': replaceOnce(
      addLink(
        lock,
        'packages/domain-activities',
        'dependencies',
        'shared-auth',
        'link:../shared-auth'
      ),
      COMMITLINT,
      COMMITLINT.replace('20.5.3', '20.5.4')
    ),
  };
  const first = lock.indexOf('\n  apps/web:\n');
  const second = lock.indexOf('\n  packages/database:\n');
  const third = lock.indexOf('\n  packages/domain-activities:\n');
  cases['importer order'] =
    lock.slice(0, first) +
    lock.slice(second, third) +
    lock.slice(first, second) +
    lock.slice(third);
  for (const [name, text] of Object.entries(cases)) {
    assert.notEqual(text, lock, name);
    assert.notEqual(digest(text), base, name);
  }
});

test('refused outright, by the projection and the importer reader: malformed first-party entries', () => {
  const add = (importer, name, target, specifier) =>
    insertAfter(lock, importer, '    dependencies:', link(name, target, specifier));
  const cases = {
    'registry specifier': add('packages/domain-activities', 'shared-auth', '1.0.0', '^1.0.0'),
    'another package': add('packages/domain-activities', 'shared-auth', 'link:../shared-utils'),
    'outside the repository': add(
      'packages/domain-activities',
      'shared-auth',
      'link:../../../shared-auth'
    ),
    'file protocol': add('packages/domain-activities', 'shared-auth', 'file:../shared-auth'),
    'package-relative path from web': add('apps/web', 'domain-privacy', 'link:../domain-privacy'),
    'absent target package': add('packages/domain-activities', 'nope', 'link:../nope'),
    'web app as target': add('packages/domain-activities', 'web', 'link:../../apps/web'),
    'uppercase name': add('packages/domain-activities', 'Shared-auth', 'link:../Shared-auth'),
    'path in the name': add('packages/domain-activities', '../shared-auth', 'link:../shared-auth'),
    'unquoted key': insertAfter(lock, 'packages/domain-activities', '    dependencies:', [
      '      @interdomestik/shared-auth:',
      '        specifier: workspace:*',
      '        version: link:../shared-auth',
    ]),
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.throws(() => digest(text), refused, name);
    assert.throws(() => lockImporters(Buffer.from(text, 'utf8')), refused, name);
  }
});

test('refused outright: missing, empty, unparseable and valid-but-empty lockfiles', () => {
  const header = "lockfileVersion: '9.0'\n";
  const cases = {
    missing: undefined,
    null: null,
    'not bytes': lock,
    empty: Buffer.alloc(0),
    'header only': Buffer.from(header),
    'no importers': Buffer.from(lock.replace('\nimporters:\n', '\nimporterz:\n')),
    'importers with a value': Buffer.from(lock.replace('\nimporters:\n', '\nimporters: {}\n')),
    'empty importers': Buffer.from(`${header}\nimporters:\n\npackages: {}\n`),
    'invalid utf-8': Buffer.concat([Buffer.from(lock), Buffer.from([0xff, 0x0a])]),
    bom: Buffer.from(`\uFEFF${lock}`),
    crlf: Buffer.from(lock.replace('\n', '\r\n')),
    tab: Buffer.from(lock.replace('\nimporters:\n', '\nimporters:\n\t\n')),
    nul: Buffer.from(lock.replace('\nimporters:\n', '\nimporters:\n\0\n')),
    'no final newline': Buffer.from(lock.slice(0, -1)),
    'extra final newline': Buffer.from(`${lock}\n`),
    'duplicate top-level key': Buffer.from(`${lock}settings:\n  x: 1\n`),
    'duplicate importer': Buffer.from(
      replaceOnce(
        lock,
        '\n  apps/web:\n',
        '\n  packages/database:\n    devDependencies:\n      x:\n        specifier: 1\n        version: 1.0.0\n\n  apps/web:\n'
      )
    ),
    'duplicate block': Buffer.from(
      insertAfter(lock, 'packages/shared-auth', '  packages/shared-auth:', [
        '    devDependencies:',
        '      x:',
        '        specifier: 1',
        '        version: 1.0.0',
      ])
    ),
    'duplicate entry': Buffer.from(
      insertAfter(lock, 'packages/domain-activities', '    dependencies:', [
        "      '@interdomestik/database':",
        '        specifier: workspace:*',
        '        version: link:../database',
      ])
    ),
    'unknown block key': Buffer.from(
      insertAfter(lock, 'packages/shared-auth', '  packages/shared-auth:', [
        '    dependenciesMeta:',
        '      x:',
        '        specifier: 1',
        '        version: 1.0.0',
      ])
    ),
    'empty input block': Buffer.from(
      insertAfter(lock, 'packages/shared-auth', '  packages/shared-auth:', ['    dependencies:'])
    ),
    'version before specifier': Buffer.from(
      insertAfter(lock, 'packages/domain-activities', '    dependencies:', [
        '      x:',
        '        version: 1.0.0',
        '        specifier: 1',
      ])
    ),
    'third entry line': Buffer.from(
      insertAfter(lock, 'packages/domain-activities', '    dependencies:', [
        '      x:',
        '        specifier: 1',
        '        version: 1.0.0',
        '        optional: true',
      ])
    ),
    'orphan continuation': Buffer.from(
      insertAfter(lock, 'packages/domain-activities', '    dependencies:', ['          stray: 1'])
    ),
    'double-quoted key': Buffer.from(
      insertAfter(lock, 'packages/domain-activities', '    dependencies:', [
        '      "@interdomestik/shared-auth":',
        '        specifier: workspace:*',
        '        version: link:../shared-auth',
      ])
    ),
  };
  for (const [name, input] of Object.entries(cases))
    assert.throws(() => lockProjection(input), refused, name);
});
