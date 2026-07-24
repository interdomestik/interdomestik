import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveGateCommand, validateGateCommandIds } from './z620-gate-command-lib.mjs';
import {
  evidenceRunId,
  resolveCacheRoot,
  resolveEvidenceDirectory,
  resolveRunsRoot,
  resolveStateRoot,
  resourceGateArguments,
} from './z620-resource-policy.mjs';
import { parseResourceOptions } from './z620-resource-options.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const gates = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-gates.json')));

test('gate configuration can select only statically approved command identifiers', () => {
  assert.deepEqual(validateGateCommandIds(gates), []);
  assert.deepEqual(resolveGateCommand('repo-size-check'), {
    command: '/usr/local/bin/pnpm',
    args: ['repo:size:check'],
  });
  const commandIds = Object.values(gates.lanes).flatMap(lane => lane.commands);
  assert.equal(
    commandIds.every(id => path.isAbsolute(resolveGateCommand(id).command)),
    true
  );
  assert.throws(() => resolveGateCommand('bash -c attacker'), /Unknown gate command/);
});

test('resource runner rejects command separators and unknown options', () => {
  assert.throws(
    () => parseResourceOptions(['--lanes=database', '--', 'bash', '-c', 'id']),
    /does not accept arbitrary commands/
  );
  assert.throws(() => parseResourceOptions(['--command=bash']), /Unknown resource option/);
});

test('resource runner builds only the fixed Node gate-runner invocation', t => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-home-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const evidenceDir = path.join(homeDir, 'ci/interdomestik/runs/review-r1');
  const options = parseResourceOptions([
    '--lanes=database,e2e-pr',
    `--evidence-dir=${evidenceDir}`,
  ]);
  const invocation = resourceGateArguments(options, root, homeDir);
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], path.join(root, 'scripts/ci/z620-gate-run.mjs'));
  assert.match(invocation.args.join(' '), /--lanes=database,e2e-pr/);
  assert.doesNotMatch(invocation.args.join(' '), /\bbash\b|(?:^|\s)-c(?:\s|$)/);
});

test('managed evidence and state paths reject traversal and nested run paths', t => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-home-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const runDir = path.join(homeDir, 'ci/interdomestik/runs/review-r1');
  assert.equal(resolveEvidenceDirectory(runDir, root, homeDir), runDir);
  assert.equal(evidenceRunId(runDir, root, homeDir), 'review-r1');
  assert.throws(
    () => resolveEvidenceDirectory(path.join(homeDir, 'outside'), root, homeDir),
    /managed evidence root/
  );
  assert.throws(
    () => resolveEvidenceDirectory(path.join(runDir, 'nested'), root, homeDir),
    /direct child/
  );
  assert.throws(
    () => resolveStateRoot(path.join(homeDir, 'outside-state'), root, homeDir),
    /managed state root/
  );
  assert.throws(
    () => resolveRunsRoot(path.join(homeDir, 'outside-runs'), root, homeDir),
    /managed runs root/
  );
  assert.throws(
    () => resolveCacheRoot(path.join(homeDir, 'outside-cache'), root, homeDir),
    /managed cache root/
  );
});
