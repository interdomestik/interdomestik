import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { spawnSync } from 'node:child_process';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('private provisioning follows normal version resolution and precedes dependencies', () => {
  assert.equal(
    structuredArtifactOwner('.github/actions/setup/action.yml'),
    'private-node-cache-contract'
  );
  assert.equal(structuredArtifactOwner('.github/actions/unrelated/action.yml'), null);
  const action = yaml.load(fs.readFileSync('.github/actions/setup/action.yml', 'utf8'));
  const steps = action.runs.steps;
  const hosted = steps.find(s => s.name === 'Provision private hosted Node');
  assert.ok(hosted, 'hosted setup must isolate the actual runtime cache');
  assert.equal(hosted.if, "runner.environment == 'github-hosted' && runner.os == 'Linux'");
  for (const [environment, os, enabled] of [
    ['github-hosted', 'Linux', true],
    ['github-hosted', 'macOS', false],
    ['github-hosted', 'Windows', false],
    ['self-hosted', 'Linux', false],
  ]) {
    const runner = { environment, os };
    const actual = hosted.if.split(' && ').every(clause => {
      const match = /^runner\.(environment|os) == '([^']+)'$/.exec(clause);
      assert.ok(match, 'private routing must use explicit runner equality checks');
      return runner[match[1]] === match[2];
    });
    assert.equal(actual, enabled);
  }
  assert.equal(hosted.run, 'node scripts/ci/setup-private-node-cache.mjs provision');
  assert.equal(hosted.env.PRIVATE_NODE_CACHE, '${{ steps.private-node-cache.outputs.path }}');
  const shared = steps.find(s => s.name === 'Setup Node');
  assert.equal(shared.if, undefined);
  assert.equal(shared.env, undefined);
  assert.equal(shared.uses, 'actions/setup-node@v5');
  assert.deepEqual(shared.with, { 'node-version-file': '.nvmrc', cache: 'pnpm' });
  assert.ok(steps.indexOf(shared) < steps.indexOf(hosted));
  assert.ok(steps.indexOf(hosted) < steps.findIndex(s => s.name === 'Install dependencies'));
  const prepare = steps.find(s => s.id === 'private-node-cache');
  assert.equal(prepare.if, hosted.if);
  assert.ok(steps.indexOf(prepare) < steps.indexOf(hosted));
  const verify = steps.find(s => s.name === 'Verify private hosted Node');
  assert.equal(verify.if, hosted.if);
  assert.ok(steps.indexOf(verify) > steps.findIndex(s => s.name === 'Install dependencies'));
});

test('release selection preserves exact resolved version and rejects unsafe or incompatible inputs', async () => {
  const runtime = await import('./setup-private-node-cache.mjs');
  assert.equal(typeof runtime.nodeRelease, 'function');
  assert.deepEqual(runtime.nodeRelease('24.20.0', 'linux', 'x64', '24'), {
    archive: 'node-v24.20.0-linux-x64.tar.xz',
    member: 'node-v24.20.0-linux-x64/bin/node',
    base: 'https://nodejs.org/dist/v24.20.0/',
  });
  for (const args of [
    ['24.20.0/../../', 'linux', 'x64', '24'],
    ['24.20.0', 'darwin', 'x64', '24'],
    ['24.20.0', 'linux', '../x64', '24'],
    ['24.20.0', 'linux', 'x64', '25'],
    ['24.20.0', 'linux', 'x64', '2'],
  ])
    assert.throws(() => runtime.nodeRelease(...args), /unsupported|invalid|match/);
});

test('cache selection binds the prepared direct child identity and refuses other owned targets', async t => {
  const runtime = await import('./setup-private-node-cache.mjs');
  assert.equal(typeof runtime.validatedPrivateCache, 'function');
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cache-identity-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const cache = runtime.preparePrivateNodeCache(temp);
  const info = fs.statSync(cache);
  const identity = `${info.dev}:${info.ino}`;
  assert.equal(runtime.validatedPrivateCache(cache, temp, identity), cache);
  assert.throws(() => runtime.validatedPrivateCache(cache, temp, '0:0'), /identity/);
  assert.throws(() => runtime.validatedPrivateCache(temp, temp, identity), /child/);
  const other = path.join(temp, 'unrelated');
  fs.mkdirSync(other, { mode: 0o700 });
  fs.writeFileSync(path.join(other, 'SHASUMS256.txt'), 'keep');
  assert.throws(() => runtime.validatedPrivateCache(other, temp, identity), /child/);
  const link = path.join(temp, 'interdomestik-node-ABC123');
  fs.symlinkSync(cache, link);
  assert.throws(() => runtime.validatedPrivateCache(link, temp, identity), /symlink/);
  assert.equal(fs.readFileSync(path.join(other, 'SHASUMS256.txt'), 'utf8'), 'keep');
});

test('CLI uses prepared state, not caller-asserted identity, and preserves nonempty targets', t => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cache-cli-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const output = path.join(temp, 'output');
  fs.writeFileSync(output, '');
  const env = {
    ...process.env,
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_TEMP: temp,
    GITHUB_OUTPUT: output,
  };
  const run = (command, extra = {}) =>
    spawnSync(process.execPath, ['scripts/ci/setup-private-node-cache.mjs', command], {
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
  assert.equal(run('prepare').status, 0);
  const cache = fs
    .readFileSync(output, 'utf8')
    .split('\n')
    .find(line => line.startsWith('path='))
    .slice(5);
  const other = fs.mkdtempSync(path.join(temp, 'interdomestik-node-'));
  const info = fs.statSync(other);
  const escaped = run('provision', {
    PRIVATE_NODE_CACHE: other,
    PRIVATE_NODE_CACHE_ID: `${info.dev}:${info.ino}`,
  });
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /prepared|identity/);
  assert.deepEqual(fs.readdirSync(other), []);
  fs.writeFileSync(path.join(cache, 'SHASUMS256.txt'), 'must survive');
  const nonempty = run('provision', { PRIVATE_NODE_CACHE: cache });
  assert.notEqual(nonempty.status, 0);
  assert.match(nonempty.stderr, /empty/);
  assert.equal(fs.readFileSync(path.join(cache, 'SHASUMS256.txt'), 'utf8'), 'must survive');
});

test('archive checksum requires one exact manifest entry and rejects corrupted bytes', async () => {
  const runtime = await import('./setup-private-node-cache.mjs');
  assert.equal(typeof runtime.verifyArchiveHash, 'function');
  const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const manifest = `${hash}  node.tar.xz\n`;
  assert.doesNotThrow(() => runtime.verifyArchiveHash(Buffer.from('abc'), manifest, 'node.tar.xz'));
  for (const text of ['', manifest + manifest, `${hash}  other-node.tar.xz\n`])
    assert.throws(
      () => runtime.verifyArchiveHash(Buffer.from('abc'), text, 'node.tar.xz'),
      /manifest/
    );
  assert.throws(
    () => runtime.verifyArchiveHash(Buffer.from('bad'), manifest, 'node.tar.xz'),
    /checksum/
  );
});

test('verified archive persistence never overwrites existing files or follows symlinks', async t => {
  const runtime = await import('./setup-private-node-cache.mjs');
  assert.equal(typeof runtime.persistVerifiedArchive, 'function');
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archive-write-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const archive = path.join(temp, 'node.tar.xz');
  const manifest =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  node.tar.xz\n';
  assert.throws(
    () => runtime.persistVerifiedArchive(Buffer.from('bad'), manifest, archive),
    /checksum/
  );
  assert.equal(fs.existsSync(archive), false);
  const victim = path.join(temp, 'victim');
  fs.writeFileSync(victim, 'keep');
  fs.symlinkSync(victim, archive);
  assert.throws(
    () => runtime.persistVerifiedArchive(Buffer.from('abc'), manifest, archive),
    /EEXIST/
  );
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
  fs.unlinkSync(archive);
  runtime.persistVerifiedArchive(Buffer.from('abc'), manifest, archive);
  assert.equal(fs.readFileSync(archive, 'utf8'), 'abc');
  assert.throws(
    () => runtime.persistVerifiedArchive(Buffer.from('abc'), manifest, archive),
    /EEXIST/
  );
});

test('private cache is unique, owned and restrictive; unsafe ancestors and escaped installs fail', async t => {
  const { preparePrivateNodeCache, validateInstalledNode } =
    await import('./setup-private-node-cache.mjs');
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'private-node-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const first = preparePrivateNodeCache(temp);
  const second = preparePrivateNodeCache(temp);
  assert.notEqual(first, second);
  assert.equal(fs.statSync(first).mode & 0o777, 0o700);
  assert.equal(fs.statSync(first).uid, process.getuid());
  assert.equal(path.dirname(first), temp);
  const bin = path.join(first, 'node', '24.20.0', 'x64', 'bin');
  fs.mkdirSync(bin, { recursive: true, mode: 0o755 });
  const node = path.join(bin, 'node');
  fs.writeFileSync(node, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.equal(validateInstalledNode(first, node), node);
  fs.chmodSync(bin, 0o777);
  assert.throws(() => validateInstalledNode(first, node), /untrusted/);
  fs.chmodSync(bin, 0o755);
  fs.chmodSync(node, 0o777);
  assert.throws(() => validateInstalledNode(first, node), /untrusted/);
  assert.throws(() => validateInstalledNode(first, process.execPath), /outside private cache/);
  fs.chmodSync(temp, 0o777);
  const before = fs.readdirSync(temp);
  assert.throws(() => preparePrivateNodeCache(temp), /untrusted/);
  assert.deepEqual(fs.readdirSync(temp), before, 'unsafe parent must not be mutated');
});

test('only the exact regular Node archive member is installed; links and missing members fail', async t => {
  const { preparePrivateNodeCache, extractNodeBinary } =
    await import('./setup-private-node-cache.mjs');
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'node-archive-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const member = 'node-v24.20.0-linux-x64/bin/node';
  fs.mkdirSync(path.dirname(path.join(temp, member)), { recursive: true });
  fs.writeFileSync(path.join(temp, member), 'synthetic-node-bytes', { mode: 0o755 });
  const archive = path.join(temp, 'fixture.tar.xz');
  const pack = () => {
    const result = spawnSync('/usr/bin/tar', ['-cJf', archive, '-C', temp, member]);
    assert.equal(result.status, 0, result.stderr.toString());
  };
  pack();
  const cache = preparePrivateNodeCache(temp);
  const node = extractNodeBinary(archive, member, cache);
  assert.equal(fs.readFileSync(node, 'utf8'), 'synthetic-node-bytes');
  assert.deepEqual(fs.readdirSync(cache), ['bin']);
  assert.throws(
    () => extractNodeBinary(archive, 'missing/bin/node', preparePrivateNodeCache(temp)),
    /member/
  );
  fs.unlinkSync(path.join(temp, member));
  fs.symlinkSync('/usr/bin/true', path.join(temp, member));
  pack();
  const rejected = preparePrivateNodeCache(temp);
  assert.throws(() => extractNodeBinary(archive, member, rejected), /member/);
  assert.deepEqual(fs.readdirSync(rejected), []);
});
