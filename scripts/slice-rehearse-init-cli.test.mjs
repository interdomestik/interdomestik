import assert from 'node:assert/strict';
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
      authority: { source: 'live-resolver', runtimeAuthorized: false, activeSlice: null },
    }),
    stdout: value => {
      output += value;
    },
  });
  assert.equal(status, 0);
  assert.equal(output, canonicalJson(JSON.parse(output)));
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
