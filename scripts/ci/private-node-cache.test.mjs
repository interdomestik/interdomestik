import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

test('hosted Node setup alone receives a private cache; self-hosted setup is unchanged', () => {
  const action = yaml.load(fs.readFileSync('.github/actions/setup/action.yml', 'utf8'));
  const steps = action.runs.steps;
  const hosted = steps.find(s => s.name === 'Setup private hosted Node');
  assert.ok(hosted, 'hosted setup must isolate the actual runtime cache');
  assert.equal(hosted.if, "runner.environment == 'github-hosted'");
  assert.equal(hosted.uses, 'actions/setup-node@v5');
  assert.equal(hosted.env.RUNNER_TOOL_CACHE, '${{ steps.private-node-cache.outputs.path }}');
  assert.deepEqual(hosted.with, { 'node-version-file': '.nvmrc', cache: 'pnpm' });
  const shared = steps.find(s => s.name === 'Setup Node');
  assert.equal(shared.if, "runner.environment != 'github-hosted'");
  assert.equal(shared.env, undefined);
  assert.deepEqual(shared.with, hosted.with);
  const prepare = steps.find(s => s.id === 'private-node-cache');
  assert.equal(prepare.if, hosted.if);
  assert.ok(steps.indexOf(prepare) < steps.indexOf(hosted));
  const verify = steps.find(s => s.name === 'Verify private hosted Node');
  assert.equal(verify.if, hosted.if);
  assert.ok(steps.indexOf(verify) > steps.findIndex(s => s.name === 'Install dependencies'));
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
