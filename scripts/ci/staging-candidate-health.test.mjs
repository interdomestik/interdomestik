import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareStagingAlias, confirmStagingAliasTarget } from './vercel-staging-alias-state.mjs';
const HOST = 'interdomestik-candidate-ecohub.vercel.app';
const COMMIT = 'a'.repeat(40);
const ENV = {};

test('candidate must pass exact health before any previous-target snapshot or movement', async () => {
  const calls = [];
  const options = {
    baseUrl: `https://${HOST}`,
    hostname: HOST,
    expectedCommitSha: COMMIT,
    snapshotImpl: async () => {
      calls.push('snapshot');
      return { commitSha: COMMIT };
    },
    healthImpl: async params => {
      calls.push(params);
      throw new Error('candidate unhealthy or wrong SHA');
    },
  };
  await assert.rejects(prepareStagingAlias(options), /candidate unhealthy/u);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].healthUrl, `https://${HOST}/api/health`);
  assert.equal(calls[0].expectedCommitSha, COMMIT);
  assert.equal(
    calls[0].log,
    console.error,
    'health diagnostics must not corrupt GITHUB_OUTPUT on stdout'
  );
  for (const baseUrl of ['https://foreign.example', `https://${HOST}/other`, `http://${HOST}`]) {
    await assert.rejects(prepareStagingAlias({ ...options, baseUrl }), /exact immutable URL/u);
  }
  calls.length = 0;
  await prepareStagingAlias({
    ...options,
    healthImpl: async params => calls.push(params),
  });
  assert.deepEqual(calls, [
    { healthUrl: `https://${HOST}/api/health`, expectedCommitSha: COMMIT, log: console.error },
    'snapshot',
    {
      healthUrl: 'https://staging.interdomestik.com/api/health',
      expectedCommitSha: COMMIT,
      log: console.error,
    },
  ]);
});

test('canonical health must match the preimage before the alias can move', async () => {
  const calls = [];
  await assert.rejects(
    prepareStagingAlias({
      baseUrl: `https://${HOST}`,
      hostname: HOST,
      expectedCommitSha: COMMIT,
      snapshotImpl: async () => {
        calls.push('snapshot');
        return { commitSha: 'b'.repeat(40) };
      },
      healthImpl: async params => {
        calls.push(params);
        if (params.healthUrl === 'https://staging.interdomestik.com/api/health') {
          throw new Error('canonical host unavailable');
        }
      },
    }),
    /canonical host unavailable/u
  );
  assert.equal(calls[2].expectedCommitSha, 'b'.repeat(40));
});

test('post-assignment confirmation requires healthy immutable and canonical exact targets', async () => {
  for (const failOn of [1, 2]) {
    const calls = [];
    await assert.rejects(
      confirmStagingAliasTarget({
        deploymentHostname: HOST,
        expectedCommitSha: COMMIT,
        env: { ...ENV, STAGING_ALIAS_CONFIRM_ATTEMPTS: '1' },
        snapshotImpl: async () => ({
          deploymentHostname: HOST,
          commitSha: COMMIT,
          previousHealth: { status: 'unavailable' },
        }),
        healthImpl: async params => {
          calls.push(params);
          if (calls.length === failOn) throw new Error('unhealthy');
        },
      }),
      /unhealthy/u
    );
    assert.equal(calls.length, failOn);
    assert.equal(calls[0].expectedCommitSha, COMMIT);
  }
});

test('post-assignment confirmation tolerates bounded canonical transport failure without relaxing SHA', async () => {
  const calls = [];
  let canonicalAttempts = 0;
  let waits = 0;
  await confirmStagingAliasTarget({
    deploymentHostname: HOST,
    expectedCommitSha: COMMIT,
    env: { STAGING_ALIAS_CONFIRM_ATTEMPTS: '3', STAGING_ALIAS_RETRY_MS: '1' },
    snapshotImpl: async () => ({ deploymentHostname: HOST, commitSha: COMMIT }),
    healthImpl: async params => {
      calls.push(params);
      if (
        params.healthUrl === 'https://staging.interdomestik.com/api/health' &&
        ++canonicalAttempts < 3
      ) {
        const error = new Error('Could not resolve host');
        error.code = 6;
        throw error;
      }
    },
    waitImpl: async () => {
      waits += 1;
    },
  });
  assert.equal(canonicalAttempts, 3);
  assert.equal(waits, 2);
  assert.equal(calls.length, 6);
  assert.ok(calls.every(call => call.expectedCommitSha === COMMIT));
});

test('default confirmation stops after twelve bounded attempts', async () => {
  let attempts = 0;
  let waits = 0;
  await assert.rejects(
    confirmStagingAliasTarget({
      deploymentHostname: HOST,
      expectedCommitSha: COMMIT,
      env: {},
      snapshotImpl: async () => {
        attempts += 1;
        throw new Error('provider temporarily unavailable');
      },
      waitImpl: async () => {
        waits += 1;
      },
    }),
    /provider temporarily unavailable/u
  );
  assert.equal(attempts, 12);
  assert.equal(waits, 11);
});

test('deployment calls candidate health preparation before recording or moving the alias', () => {
  const source = readFileSync(new URL('./configure-vercel-gate-url.mjs', import.meta.url), 'utf8');
  const preflight = source.indexOf('await state.prepareStagingAlias');
  const snapshot = source.indexOf('aliasMoved: false');
  const assignment = source.indexOf('await aliasStagingDeployment', snapshot);
  assert.ok(preflight > 0 && preflight < snapshot && snapshot < assignment);
});
