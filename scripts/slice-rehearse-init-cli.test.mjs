import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson } from './slice-rehearse-core.mjs';
import { runManifestInitializer } from './slice-rehearse-init-cli.mjs';

const request = {
  schemaVersion: 1,
  sliceId: 'HARNESS-V2-1',
  tier: 3,
  workClass: 'governance',
  writerPaths: ['scripts/slice-rehearse-init.mjs'],
  proofCommands: ['pnpm test:harness-v2'],
  heavyLanes: ['pr-e2e'],
  routineOperations: ['rerun_invalidated_proof'],
};

test('normal initializer command emits canonical valid evidence on its first invocation', () => {
  let output = '';
  const status = runManifestInitializer({
    argv: ['--request', '/private/tmp/request.json'],
    readRequest: () => request,
    collectFacts: () => ({
      baseSha: 'a'.repeat(40),
      origin: 'https://github.com/interdomestik/interdomestik.git',
      existingPaths: [],
      workflowDigest: 'b'.repeat(64),
      substrateDigest: 'c'.repeat(64),
      proofCommands: ['canonical pr-e2e command'],
      authority: { source: 'live-resolver', runtimeAuthorized: false, activeSlice: null },
    }),
    stdout: value => {
      output += value;
    },
  });
  assert.equal(status, 0);
  assert.equal(output, canonicalJson(JSON.parse(output)));
  assert.deepEqual(JSON.parse(output).proof.commands, ['canonical pr-e2e command']);
});

test('initializer reports one consolidated failure without partial output', () => {
  let stderr = '';
  const status = runManifestInitializer({
    argv: ['--request', '/private/tmp/request.json'],
    readRequest: () => ({ ...request, writerPaths: [], proofCommands: [] }),
    collectFacts: () => ({ authority: null }),
    stdout: () => assert.fail('must not emit a partial manifest'),
    stderr: value => {
      stderr += value;
    },
  });
  assert.equal(status, 1);
  assert.match(stderr, /writerPaths/u);
  assert.match(stderr, /proofCommands/u);
  assert.match(stderr, /baseSha/u);
});

test('initializer rejects unsafe writer paths before collecting repository facts', () => {
  let stderr = '';
  let factsCollected = false;
  const status = runManifestInitializer({
    argv: ['--request', '/private/tmp/request.json'],
    readRequest: () => ({ ...request, writerPaths: ['../../outside-repository'] }),
    collectFacts: () => {
      factsCollected = true;
      return {};
    },
    stderr: value => {
      stderr += value;
    },
  });
  assert.equal(status, 1);
  assert.equal(factsCollected, false);
  assert.match(stderr, /writer path is unsafe/u);
});

test('initializer creates output through the trusted path boundary and rejects symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-output-'));
  const collectFacts = () => ({
    baseSha: 'a'.repeat(40),
    origin: 'https://github.com/interdomestik/interdomestik.git',
    existingPaths: [],
    workflowDigest: 'b'.repeat(64),
    substrateDigest: 'c'.repeat(64),
    authority: { source: 'live-resolver', runtimeAuthorized: false, activeSlice: null },
  });
  const options = {
    cwd: root,
    readRequest: () => request,
    collectFacts,
    stderr: value => assert.fail(value),
  };

  assert.equal(
    runManifestInitializer({
      ...options,
      argv: ['--request', 'request.json', '--output', 'out.json'],
    }),
    0
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'out.json'), 'utf8')).sliceId,
    'HARNESS-V2-1'
  );

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-outside-'));
  fs.symlinkSync(outside, path.join(root, 'linked'));
  let stderr = '';
  assert.equal(
    runManifestInitializer({
      ...options,
      argv: ['--request', 'request.json', '--output', 'linked/out.json'],
      stderr: value => {
        stderr += value;
      },
    }),
    1
  );
  assert.match(stderr, /symlink/u);
});
