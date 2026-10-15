import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADOPTION } from './db-access-adoption.mjs';
import {
  RESOLVER_SNAPSHOT,
  verifyCurrentResolverSnapshot,
} from './db-access-resolver-snapshot.mjs';
import { authenticateSnapshot, resolverFile, verifyResolverBoundary } from './db-access-trust.mjs';
import { runGit } from './db-access-git.mjs';
import {
  createTempRepo,
  rootDir,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const pair = Object.keys(RESOLVER_SNAPSHOT.files);
const current = new Map(pair.map(file => [file, fs.readFileSync(path.join(rootDir, file))]));
const previous = new Map(
  pair.map(file => [file, runGit(['-C', rootDir, 'show', `${ADOPTION.commit}:${file}`])])
);
function fixture(t, contents = current) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, bytes] of contents) fs.writeFileSync(path.join(root, file), bytes);
  return root;
}

test('production snapshot admits exactly the new pair without replacing historical adoption', t => {
  const root = fixture(t);
  const accepted = verifyCurrentResolverSnapshot(root, ADOPTION);
  assert.deepEqual([...accepted.keys()], pair);
  assert.equal(accepted.get(pair[0]), current.get(pair[0]).toString());
  assert.equal(ADOPTION.commit, '278e33ab0dd448547fa81d4b0ff122b4d69c901e');
  assert.equal(
    ADOPTION.files['scripts/ci/db-access-baseline.json'],
    RESOLVER_SNAPSHOT.baselineSha256
  );
  assert.equal(ADOPTION.critical.length, 4);
  assert.ok(Object.isFrozen(RESOLVER_SNAPSHOT.files[pair[0]]));
  assert.equal(resolverFile('pnpm-lock.yaml'), false, 'fixture resolver semantics stay unchanged');
});

test('old pair, mixed pair and same-size metadata tampering are rejected', t => {
  for (const contents of [
    previous,
    new Map([
      [pair[0], current.get(pair[0])],
      [pair[1], previous.get(pair[1])],
    ]),
  ]) {
    const root = fixture(t, contents);
    assert.throws(
      () => verifyCurrentResolverSnapshot(root, ADOPTION),
      /resolver snapshot .*mismatch/u
    );
  }
  for (const file of pair) {
    const root = fixture(t);
    const bytes = Buffer.from(current.get(file));
    bytes[bytes.length - 2] ^= 1;
    fs.writeFileSync(path.join(root, file), bytes);
    assert.throws(
      () => verifyCurrentResolverSnapshot(root, ADOPTION),
      /resolver snapshot digest mismatch/u
    );
  }
});

test('missing, symlinked, non-file and case-ambiguous metadata fail closed', t => {
  for (const file of pair) {
    for (const mode of ['missing', 'symlink', 'directory', 'alias']) {
      const root = fixture(t);
      const full = path.join(root, file);
      fs.rmSync(full);
      if (mode === 'symlink') fs.symlinkSync(path.join(rootDir, file), full);
      if (mode === 'directory') fs.mkdirSync(full);
      if (mode === 'alias')
        fs.writeFileSync(path.join(root, file.toUpperCase()), current.get(file));
      assert.throws(
        () => verifyCurrentResolverSnapshot(root, ADOPTION),
        /resolver snapshot (missing or ambiguous|non-regular)/u
      );
    }
  }
});

test('snapshot cannot authenticate another adoption, tree or baseline', t => {
  const root = fixture(t);
  for (const change of [
    { commit: '0'.repeat(40) },
    { tree: '0'.repeat(40) },
    { files: { ...ADOPTION.files, 'scripts/ci/db-access-baseline.json': '0'.repeat(64) } },
  ])
    assert.throws(
      () => verifyCurrentResolverSnapshot(root, { ...ADOPTION, ...change }),
      /adoption mismatch/u
    );
});

test('snapshot changes only workspace comparison; package, config, hook and extra resolver changes still reject', () => {
  const root = createTempRepo();
  for (const [file, bytes] of previous) writeFixture(root, file, bytes);
  sealFixture(root);
  const epoch = JSON.parse(fs.readFileSync(path.join(root, '.fixture-adoption.json'), 'utf8'));
  const trusted = authenticateSnapshot(root, epoch);
  for (const [file, bytes] of current) writeFixture(root, file, bytes);
  const accepted = verifyCurrentResolverSnapshot(root, ADOPTION);
  assert.throws(
    () => verifyResolverBoundary(root, trusted),
    /resolver boundary changed pnpm-workspace/u
  );
  assert.doesNotThrow(() => verifyResolverBoundary(root, trusted, accepted));
  for (const [file, bytes] of [
    ['apps/web/package.json', '{"dependencies":{"evil":"1"}}'],
    ['apps/web/tsconfig.json', '{"compilerOptions":{"paths":{"*": ["evil/*"]}}}'],
    ['.pnpmfile.cjs', 'module.exports={hooks:{readPackage(p){return p}}};'],
    ['packages/evil/package.json', '{"name":"evil"}'],
  ]) {
    const original = fs.existsSync(path.join(root, file))
      ? fs.readFileSync(path.join(root, file))
      : undefined;
    writeFixture(root, file, bytes);
    assert.throws(
      () => verifyResolverBoundary(root, trusted, accepted),
      /resolver boundary changed/u
    );
    if (original) writeFixture(root, file, original);
    else fs.rmSync(path.join(root, file));
  }
});
