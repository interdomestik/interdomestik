// The G0 lockfile projection: only well-formed first-party workspace links leave the pin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LOCK_PROJECTION_ID, lockImporters } from './db-access-lock-projection.mjs';
import {
  addLink,
  base,
  COMMITLINT,
  digest,
  insertAfter,
  link,
  lock,
  replaceOnce,
  unlinkedPair,
} from './db-access-lock-projection.fixture.mjs';
import { rootDir } from './db-access-guard-test-utils.mjs';

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
