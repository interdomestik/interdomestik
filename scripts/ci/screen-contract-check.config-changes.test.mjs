// The build-configuration change refusal (the WP-05 flip, D-1; the owner's decision of 2026-11-23):
// under enforcement, a change that adds, removes or edits a build-configuration input the scanner
// does not check is a scanner error (exit 2) naming the files and that a scanner PR comes first.
// In the advisory run the same change is recorded in `configChanges` and refuses nothing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { judgeHead } from './fixtures/screen-contract-check/cli-cases-fixtures.mjs';
import { BASE_FILES } from './fixtures/screen-contract-check/harness.mjs';
import { BUILD_CONFIG_RE } from './screen-contract/config-changes.mjs';

const REFUSED =
  /edits build configuration the scanner does not check \(.*\); a change to it needs a scanner PR first/u;
const CONFIG = 'export default {};\n';

const enforced = (t, head, base = {}) => judgeHead(t, head, base, ['--enforcing']);
const advisory = (t, head, base = {}) => judgeHead(t, head, base);

// Each listed kind, at several levels and under new names, added to the change.
const ADDED = [
  'apps/web/next.config.js',
  'apps/web/next.config.ts',
  'apps/next.config.mjs',
  'next.config.mjs',
  'packages/ui/next.config.cjs',
  'apps/web/.babelrc',
  '.babelrc.json',
  'apps/web/babel.config.js',
  'packages/domain-claims/babel.config.cjs',
  'packages/domain-claims/tsconfig.json',
  'packages/ui/tsconfig.build.json',
  'apps/web/tsconfig.test.json',
  'tsconfig.base.json',
  'apps/web/jsconfig.json',
  'jsconfig.node.json',
  'apps/web/.swcrc',
  '.swcrc',
  // r7: the `.*` kinds with an empty suffix.
  'apps/web/next.config.',
  'apps/web/.babelrc.',
  'babel.config.',
];

test('config: each build-configuration kind added at any level is refused under enforcement', t => {
  for (const rel of ADDED) {
    assert.match(rel, BUILD_CONFIG_RE, rel);
    const { code, report } = enforced(t, {
      [rel]: rel.endsWith('json') || rel.endsWith('rc') ? '{}\n' : CONFIG,
    });
    assert.equal(code, 2, rel);
    assert.match(report.errors.join('\n'), REFUSED, rel);
    assert.match(report.errors.join('\n'), new RegExp(rel.replaceAll('.', '\\.'), 'u'), rel);
  }
});

test('config: an edit or a removal of a build-configuration file is refused under enforcement', t => {
  // An edit that keeps the pinned tsconfig value (only whitespace) still edits the file.
  const edit = enforced(t, {
    'apps/web/tsconfig.json': `${BASE_FILES['apps/web/tsconfig.json']}\n`,
  });
  assert.equal(edit.code, 2);
  assert.match(edit.report.errors.join('\n'), /apps\/web\/tsconfig\.json \([0-9a-f]{64}\)/u);
  const removal = enforced(
    t,
    { 'packages/ui/tsconfig.json': null },
    { 'packages/ui/tsconfig.json': '{}\n' }
  );
  assert.equal(removal.code, 2);
  assert.match(removal.report.errors.join('\n'), /packages\/ui\/tsconfig\.json \(absent\)/u);
  const babel = enforced(
    t,
    { 'apps/web/.babelrc': '{ "presets": ["x"] }\n' },
    { 'apps/web/.babelrc': '{}\n' }
  );
  assert.equal(babel.code, 2);
});

test('config: the advisory run records the change and refuses nothing; other files pass', t => {
  const recorded = advisory(t, { 'apps/web/.swcrc': '{}\n' });
  assert.equal(recorded.code, 0, JSON.stringify(recorded.report.errors));
  assert.deepEqual(
    recorded.report.configChanges.map(line => line.split(' ')[0]),
    ['apps/web/.swcrc']
  );
  for (const rel of [
    'apps/web/src/lib/tsconfig.ts',
    'docs/next-config.md',
    'apps/web/src/lib/babel.ts',
  ])
    assert.doesNotMatch(rel, BUILD_CONFIG_RE, rel);
  const plain = enforced(t, { 'apps/web/src/lib/tsconfig.ts': 'export const t = 1;\n' });
  assert.equal(plain.code, 0, JSON.stringify(plain.report.errors));
  assert.deepEqual(plain.report.configChanges, []);
});

// r7: a change of a reviewed wrapper's lockfile record is refused from the diff itself, whatever
// the Next config's state (the fixture trees have none); other lockfile changes pass.
test('config: a wrapper lockfile record change is refused; another lockfile change is not', t => {
  const lock = fs.readFileSync('pnpm-lock.yaml', 'utf8');
  const intl = /( {6}next-intl:\n {8}specifier: [^\n]+\n {8}version: )4\.14\.5/u;
  assert.match(lock, intl);
  const bumped = enforced(
    t,
    { 'pnpm-lock.yaml': `${lock.replace(intl, '$14.15.0')}` },
    { 'pnpm-lock.yaml': lock }
  );
  assert.equal(bumped.code, 2);
  assert.match(bumped.report.errors.join('\n'), REFUSED);
  assert.match(
    bumped.report.errors.join('\n'),
    /pnpm-lock\.yaml next-intl \(4\.14\.5 patch=none patchedDependencies=\[\] sha512-.* -> 4\.15\.0 /u
  );
  const added = enforced(t, { 'pnpm-lock.yaml': lock });
  assert.equal(added.code, 2);
  assert.match(
    added.report.errors.join('\n'),
    /pnpm-lock\.yaml @sentry\/nextjs \(absent -> 10\.75\.2 /u
  );
  const other = enforced(
    t,
    { 'pnpm-lock.yaml': `${lock}\n# an unrelated change\n` },
    { 'pnpm-lock.yaml': lock }
  );
  assert.equal(other.code, 0, JSON.stringify(other.report.errors));
  assert.deepEqual(other.report.configChanges, []);
});

// Sol r1: the whole record is compared, so a change of a wrapper's patch hash alone is refused; a
// malformed lockfile in the change is a refusal ending with the scanner-PR sentence.
test('config: a wrapper patch-hash change and a malformed lockfile are refused', t => {
  const lock = fs.readFileSync('pnpm-lock.yaml', 'utf8');
  const patch = hash =>
    lock.replace(
      /^patchedDependencies:\n/mu,
      `patchedDependencies:\n  next-intl@4.14.5:\n    hash: ${hash}\n    path: patches/next-intl@4.14.5.patch\n`
    );
  assert.notEqual(patch('a'.repeat(64)), lock);
  const hash = enforced(
    t,
    { 'pnpm-lock.yaml': patch('b'.repeat(64)) },
    { 'pnpm-lock.yaml': patch('a'.repeat(64)) }
  );
  assert.equal(hash.code, 2);
  assert.match(hash.report.errors.join('\n'), /pnpm-lock\.yaml next-intl \(.*a{64}.* -> .*b{64}/u);
  const malformed = enforced(t, { 'pnpm-lock.yaml': 'a: [\n' }, { 'pnpm-lock.yaml': lock });
  assert.equal(malformed.code, 2);
  assert.match(
    malformed.report.errors.join('\n'),
    /pnpm-lock\.yaml at [0-9a-f]+ is not parseable; a change to it needs a scanner PR first/u
  );
});
