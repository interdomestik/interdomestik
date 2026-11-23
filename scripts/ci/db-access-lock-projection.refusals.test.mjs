// The G0 lockfile projection refuses malformed first-party entries and malformed lockfiles.
import assert from 'node:assert/strict';
import test from 'node:test';
import { lockImporters, lockProjection } from './db-access-lock-projection.mjs';
import {
  digest,
  insertAfter,
  link,
  lock,
  refused,
  replaceOnce,
} from './db-access-lock-projection.fixture.mjs';

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
    // One CRLF on the first line is refused, and so is a lockfile with CRLF throughout.
    crlf: Buffer.from(replaceOnce(lock, "lockfileVersion: '9.0'\n", "lockfileVersion: '9.0'\r\n")),
    'crlf throughout': Buffer.from(lock.replaceAll('\n', '\r\n')),
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
