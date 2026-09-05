import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ENV, git, hostFixture } from './slice-rehearse-bootstrap-fixtures.mjs';

function run(f, mode = 'admit', options = {}) {
  const result = spawnSync(process.execPath, [f.loader, f.configPath, f.requestPath, mode], {
    env: ENV,
    encoding: 'utf8',
    timeout: 15_000,
    ...options,
  });
  assert.equal(result.error, undefined);
  assert.ok(result.stdout.trim(), result.stderr);
  return { status: result.status, ...JSON.parse(result.stdout) };
}

test('host admits exact isolated policy and target through real bootstrap', async t => {
  const f = await hostFixture(t);
  const before = [
    git(f.policyRoot, 'status', '--porcelain'),
    git(f.targetRoot, 'status', '--porcelain'),
  ];
  const result = run(f);
  assert.equal(result.status, 0, result.error);
  assert.deepEqual(result.result.policy, f.record.policy);
  assert.equal(result.result.target.headSha, git(f.targetRoot, 'rev-parse', 'HEAD'));
  assert.equal(result.frozen, true);
  assert.deepEqual(
    [git(f.policyRoot, 'status', '--porcelain'), git(f.targetRoot, 'status', '--porcelain')],
    before
  );
  const strict = run(f, 'strict');
  assert.equal(strict.code, 1);
  assert.match(strict.errors.join(''), /pinned policy dependency loaded/);
});

test('host rereads approval and refuses withdrawal in the same process', async t => {
  const f = await hostFixture(t);
  const result = run(f, 'revoke');
  assert.equal(result.status, 1);
  assert.match(result.error, /approval|receipt/i);
});

for (const fault of [
  'missing',
  'changed',
  'symlink',
  'permissions',
  'expired',
  'schema',
  'policy-pin',
  'policy-tree',
  'target-root',
  'target-origin',
  'loader',
  'node',
  'git',
  'github',
  'dependency',
  'request-override',
  'environment',
  'policy-bytes',
  'policy-untracked',
  'nested-policy-store',
  'approval-ancestor',
  'loader-hardlink',
  'dependency-hardlink',
]) {
  test(`host refuses before policy load: ${fault}`, async t => {
    const f = await hostFixture(t);
    if (fault === 'expired') f.record.expiresAt = '2020-01-01T00:00:00.000Z';
    if (fault === 'schema') f.record.unapproved = true;
    if (fault === 'policy-pin') f.record.policy.commitSha = 'main';
    if (fault === 'policy-tree') f.record.policy.treeSha = 'f'.repeat(40);
    if (fault === 'target-root') f.record.target.root = f.policyRoot;
    if (fault === 'target-origin') f.record.target.origin = 'https://github.com/foreign/repo';
    if (fault === 'loader') f.record.loader.sha256 = 'f'.repeat(64);
    if (['node', 'git', 'github'].includes(fault)) f.record.runtime[fault].sha256 = 'f'.repeat(64);
    if (fault === 'dependency')
      f.record.runtime.dependencyFiles.push({
        path: join(f.root, 'absent'),
        sha256: 'f'.repeat(64),
      });
    if (fault === 'request-override') f.request.trustedBootstrap = { policy: f.record.policy };
    f.bind();
    if (fault === 'loader-hardlink') linkSync(f.loader, join(f.targetRoot, 'loader-alias'));
    if (fault === 'dependency-hardlink') {
      const dep = join(f.root, 'external-dependency');
      writeFileSync(dep, 'dependency');
      linkSync(dep, join(f.targetRoot, 'dependency-alias'));
      f.record.runtime.dependencyFiles.push({ path: realpathSync(dep), sha256: 'f'.repeat(64) });
      f.bind();
    }
    if (fault === 'missing') rmSync(f.receiptPath);
    if (fault === 'changed') writeFileSync(f.receiptPath, readFileSync(f.receiptPath) + ' ');
    if (fault === 'symlink') {
      const copy = join(f.root, 'copy.receipt');
      writeFileSync(copy, readFileSync(f.receiptPath));
      rmSync(f.receiptPath);
      symlinkSync(copy, f.receiptPath);
    }
    if (fault === 'permissions') chmodSync(f.config.approvalRoot, 0o755);
    if (fault === 'policy-bytes')
      writeFileSync(join(f.policyRoot, 'scripts/dependency.mjs'), 'changed');
    if (fault === 'nested-policy-store') {
      const storage = join(f.targetRoot, 'nested-policy.git');
      git(f.policyRoot, 'init', '--separate-git-dir', storage);
    }
    if (fault === 'approval-ancestor') {
      f.config.approvalRoot = realpathSync(f.root);
      f.config.receiptName = 'copied.receipt';
      writeFileSync(join(f.root, f.config.receiptName), readFileSync(f.receiptPath), {
        mode: 0o600,
      });
      writeFileSync(f.configPath, JSON.stringify(f.config));
    }
    if (fault === 'policy-untracked') writeFileSync(join(f.policyRoot, 'ignored.mjs'), 'changed');
    const result = run(
      f,
      'strict',
      fault === 'environment' ? { env: { ...ENV, NODE_PATH: f.targetRoot } } : {}
    );
    assert.equal(result.code ?? result.status, 1, JSON.stringify(result));
    const error = result.error ?? result.errors.join('');
    assert.match(error, /host|approval|receipt|policy|strict|target|runtime|dependency|ENOENT/i);
    assert.doesNotMatch(error, /pinned policy dependency loaded/);
    if (fault.endsWith('-hardlink')) assert.match(error, /runtime file is unsafe/);
    if (fault === 'nested-policy-store') assert.match(error, /storage overlap/);
    if (fault === 'approval-ancestor') assert.match(error, /approval storage overlaps/);
  });
}

test('host rejects a changed preloaded entrypoint before its first admission', async t => {
  const f = await hostFixture(t);
  const result = run(f, 'preloaded-switch');
  assert.equal(result.status, 1);
  assert.match(result.error, /loaded module bytes changed/);
});
