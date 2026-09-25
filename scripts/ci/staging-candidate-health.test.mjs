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
  assert.deepEqual(calls, [{ healthUrl: `https://${HOST}/api/health`, expectedCommitSha: COMMIT }]);
  for (const baseUrl of ['https://foreign.example', `https://${HOST}/other`, `http://${HOST}`]) {
    await assert.rejects(prepareStagingAlias({ ...options, baseUrl }), /exact immutable URL/u);
  }
  calls.length = 0;
  await prepareStagingAlias({ ...options, healthImpl: async () => calls.push('healthy') });
  assert.deepEqual(calls, ['healthy', 'snapshot']);
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

test('deployment calls candidate health preparation before recording or moving the alias', () => {
  const source = readFileSync(new URL('./configure-vercel-gate-url.mjs', import.meta.url), 'utf8');
  const preflight = source.indexOf('await state.prepareStagingAlias');
  const snapshot = source.indexOf('aliasMoved: false');
  const assignment = source.indexOf('await aliasStagingDeployment', snapshot);
  assert.ok(preflight > 0 && preflight < snapshot && snapshot < assignment);
});
