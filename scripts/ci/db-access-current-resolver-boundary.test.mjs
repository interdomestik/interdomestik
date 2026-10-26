import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADOPTION } from './db-access-adoption.mjs';
import { runGit } from './db-access-git.mjs';
import { rootDir } from './db-access-guard-test-utils.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { providerUnitResolverSnapshot } from './db-access-provider-unit-source.mjs';
import { verifyCurrentResolverSnapshot } from './db-access-resolver-snapshot.mjs';
import { authenticateSnapshot, resolverFile, verifyResolverBoundary } from './db-access-trust.mjs';

const upgradedFiles = [
  'apps/web/next.config.mjs',
  'apps/web/package.json',
  'packages/ui/package.json',
];
const trusted = authenticateSnapshot(rootDir, ADOPTION);
function currentResolver(root) {
  const resolver = verifyCurrentResolverSnapshot(root, ADOPTION);
  for (const [file, bytes] of providerUnitResolverSnapshot(root, ADOPTION, PROVIDER_UNIT_POLICY))
    resolver.set(file, bytes);
  return resolver;
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-resolver-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = new Set([
    ...runGit(['-C', rootDir, 'ls-files', '-z']).toString().split('\0').filter(resolverFile),
    ...Object.keys(PROVIDER_UNIT_POLICY.resolverFiles),
    'scripts/ci/db-access-baseline.json',
  ]);
  for (const file of paths) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(rootDir, file), target);
  }
  return root;
}

test('the complete current resolver boundary authenticates against unchanged historical adoption', () => {
  const resolver = currentResolver(rootDir);
  for (const file of upgradedFiles) assert(resolver.has(file), 'Fixed current descriptor: ' + file);
  const all = verifyResolverBoundary(rootDir, trusted, resolver);
  assert.equal(all.size, 52);
  assert.equal(ADOPTION.commit, '278e33ab0dd448547fa81d4b0ff122b4d69c901e');
  assert.equal(
    ADOPTION.files['scripts/ci/db-access-baseline.json'],
    '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9'
  );
});

test('every mixed or historical Next config/package combination refuses exact source authentication', t => {
  const oldCommit = '8c6246b8c583cf4b17608bd37b30d55ee787c496';
  for (let mask = 1; mask < 8; mask++) {
    const root = fixture(t);
    for (const [index, file] of upgradedFiles.entries())
      if (mask & (1 << index))
        fs.writeFileSync(
          path.join(root, file),
          runGit(['-C', rootDir, 'show', oldCommit + ':' + file])
        );
    assert.throws(() => currentResolver(root), /provider unit source\/mode mismatch/u);
  }
});

test('all three current Next resolver records reject same-size edits and symlinks', t => {
  for (const file of upgradedFiles) {
    const root = fixture(t);
    const target = path.join(root, file);
    const bytes = fs.readFileSync(target);
    bytes[bytes.length - 2] ^= 1;
    fs.writeFileSync(target, bytes);
    assert.throws(() => currentResolver(root), /provider unit source\/mode mismatch/u);
    fs.rmSync(target);
    fs.symlinkSync(path.join(rootDir, file), target);
    assert.throws(() => currentResolver(root), /provider unit symlink/u);
  }
});

test('unlisted resolver additions remain refused with the exact current Next descriptors', t => {
  const root = fixture(t);
  const resolver = currentResolver(root);
  assert.doesNotThrow(() => verifyResolverBoundary(root, trusted, resolver));
  fs.writeFileSync(path.join(root, '.pnpmfile.cjs'), 'module.exports = {};\n');
  assert.throws(
    () => verifyResolverBoundary(root, trusted, resolver),
    /resolver boundary changed/u
  );
});
