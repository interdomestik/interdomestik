import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  advanceQaControlRuntime,
  resolveQaControlRuntime,
  rollbackRegistrationCas,
  writeRegistrationCas,
} from '../qa-mcp-control-runtime.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (root, ...args) =>
  execFileSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function standaloneRepository() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-control-')));
  git(root, 'init');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'remote', 'add', 'origin', 'https://github.com/interdomestik/interdomestik.git');
  for (const file of [
    'pnpm-workspace.yaml',
    'turbo.json',
    'packages/qa/src/index.ts',
    'scripts/start-repo-qa.sh',
    'node_modules/.bin/tsx',
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `${file}\n`);
  }
  git(root, 'add', '.');
  git(root, 'add', '-f', 'node_modules/.bin/tsx');
  git(root, 'commit', '-m', 'fixture A');
  const first = git(root, 'rev-parse', 'HEAD');
  fs.appendFileSync(path.join(root, 'turbo.json'), 'next\n');
  git(root, 'add', 'turbo.json');
  git(root, 'commit', '-m', 'fixture B');
  const second = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '--detach', first);
  return { first, root, second };
}

test('resolver accepts only a clean canonical detached control source', () => {
  const fixture = standaloneRepository();
  const resolved = resolveQaControlRuntime({ root: fixture.root });
  assert.equal(resolved.root, fixture.root);
  assert.equal(resolved.head, fixture.first);
  assert.equal(resolved.branch, null);
  assert.equal(resolved.origin, 'https://github.com/interdomestik/interdomestik');
  git(fixture.root, 'switch', '-c', 'attached-fixture');
  assert.throws(() => resolveQaControlRuntime({ root: fixture.root }), /attached/);
  git(fixture.root, 'checkout', '--detach', fixture.first);
  fs.appendFileSync(path.join(fixture.root, 'turbo.json'), 'dirty\n');
  assert.throws(() => resolveQaControlRuntime({ root: fixture.root }), /clean/);
});

test('runtime activation compares the preimage and rolls back only its exact postimage', () => {
  const fixture = standaloneRepository();
  const advanced = advanceQaControlRuntime({
    expectedHead: fixture.first,
    nextHead: fixture.second,
    root: fixture.root,
  });
  assert.equal(advanced.before.head, fixture.first);
  assert.equal(advanced.after.head, fixture.second);
  assert.throws(
    () =>
      advanceQaControlRuntime({
        expectedHead: fixture.first,
        nextHead: fixture.second,
        root: fixture.root,
      }),
    /preimage/
  );
  assert.throws(
    () =>
      advanceQaControlRuntime({
        expectedHead: fixture.second,
        nextHead: fixture.first,
        root: fixture.root,
      }),
    /descend/
  );
});

test('registration CAS preserves mismatch and supports exact guarded rollback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-registration-'));
  const pathname = path.join(root, 'config.toml');
  const before = Buffer.from('before\n');
  const after = Buffer.from('after\n');
  fs.writeFileSync(pathname, before, { mode: 0o600 });
  assert.throws(
    () => writeRegistrationCas({ expectedSha256: '0'.repeat(64), nextBytes: after, pathname }),
    /preimage/
  );
  assert.deepEqual(fs.readFileSync(pathname), before);
  const symlink = path.join(root, 'config-link.toml');
  fs.symlinkSync(pathname, symlink);
  assert.throws(
    () =>
      writeRegistrationCas({ expectedSha256: sha(before), nextBytes: after, pathname: symlink }),
    /unsafe/
  );
  const written = writeRegistrationCas({ expectedSha256: sha(before), nextBytes: after, pathname });
  assert.equal(written.afterSha256, sha(after));
  rollbackRegistrationCas({
    expectedPostimageSha256: sha(after),
    pathname,
    preimageBytes: before,
  });
  assert.deepEqual(fs.readFileSync(pathname), before);
});

test('CLI exposes only attested identity fields and performs no mutation', () => {
  const fixture = standaloneRepository();
  const result = execFileSync(process.execPath, ['scripts/qa-mcp-control-runtime.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      INTERDOMESTIK_QA_CONTROL_ROOT: fixture.root,
      INTERDOMESTIK_QA_CONTROL_TEST_MODE: '1',
      NODE_ENV: 'test',
    },
  });
  const parsed = JSON.parse(result);
  assert.equal(parsed.root, fixture.root);
  assert.equal(parsed.head, fixture.first);
  assert.equal(git(fixture.root, 'status', '--porcelain=v1'), '');
});

test('ordinary environment overrides cannot redirect the canonical control source', () => {
  const fixture = standaloneRepository();
  const result = spawnSync(process.execPath, ['scripts/qa-mcp-control-runtime.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, INTERDOMESTIK_QA_CONTROL_ROOT: fixture.root },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /restricted to the canonical runtime/);
});
