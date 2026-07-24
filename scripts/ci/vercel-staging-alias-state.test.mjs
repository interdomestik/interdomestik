import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_STAGING_ALIAS,
  restoreStagingAlias,
  snapshotStagingAlias,
} from './vercel-staging-alias-state.mjs';

const COMMIT = 'a'.repeat(40);
const DEPLOYMENT_ID = 'dpl_previous';
const HOST = 'interdomestik-web-old-ecohub.vercel.app';
const ALIAS_NAME = CANONICAL_STAGING_ALIAS;
const PROJECT_ID = 'prj_expected';
const TEAM_ID = 'team_expected';
const ENV = {
  VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret',
  VERCEL_ORG_ID: TEAM_ID,
  VERCEL_PROJECT_ID: PROJECT_ID,
  VERCEL_TOKEN: 'token-secret',
};
const ALIAS_STATE = { alias: ALIAS_NAME, deploymentId: DEPLOYMENT_ID, projectId: PROJECT_ID };
const DEPLOYMENT = { id: DEPLOYMENT_ID, projectId: PROJECT_ID, teamId: TEAM_ID, url: HOST };
const DIRECT_HEALTH = `health:https://${HOST}/api/health:${COMMIT}`;
const ALIAS_MOVE = `alias:${HOST}:${ALIAS_NAME}:true`;
const CANONICAL_HEALTH = `health:https://${ALIAS_NAME}/api/health:${COMMIT}`;
function response(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}
function snapshotFetch({ alias = ALIAS_STATE, deployment = DEPLOYMENT } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/v4/aliases/')) return response(alias);
      if (String(url).includes('/v13/deployments/')) return response(deployment);
      throw new Error(`Unexpected request: ${url}`);
    },
  };
}
function restoreFixture(failOnHealth = 0) {
  const calls = [];
  let healthChecks = 0;
  return {
    calls,
    options: {
      commitSha: COMMIT,
      deploymentHostname: HOST,
      env: ENV,
      aliasImpl: async (hostname, alias, env) =>
        calls.push(`alias:${hostname}:${alias}:${env === ENV}`),
      healthImpl: async ({ healthUrl, expectedCommitSha }) => {
        healthChecks += 1;
        calls.push(`health:${healthUrl}:${expectedCommitSha}`);
        if (healthChecks === failOnHealth) throw new Error('Deployed build provenance mismatch');
      },
    },
  };
}
test('snapshot authenticates alias/deployment ownership and captures exact commit', async () => {
  const fixture = snapshotFetch();
  const result = await snapshotStagingAlias({
    env: ENV,
    fetchImpl: fixture.fetchImpl,
    healthImpl: async ({ healthUrl }) => {
      assert.equal(healthUrl, `https://${HOST}/api/health`);
      return JSON.stringify({ build: { commitSha: COMMIT } });
    },
  });
  assert.deepEqual(result, { deploymentHostname: HOST, commitSha: COMMIT });
  assert.equal(fixture.calls.length, 2);
  assert.equal(new URL(fixture.calls[1].url).pathname, `/v13/deployments/${DEPLOYMENT_ID}`);
  for (const call of fixture.calls) {
    assert.equal(call.init.headers.authorization, `Bearer ${ENV.VERCEL_TOKEN}`);
    assert.match(call.url, new RegExp(`teamId=${ENV.VERCEL_ORG_ID}`));
  }
});
test('snapshot fails closed for missing, redirected, or malformed aliases', async () => {
  for (const alias of [
    {},
    { ...ALIAS_STATE, redirect: 'other.example' },
    { alias: ALIAS_NAME, projectId: PROJECT_ID },
  ]) {
    const fixture = snapshotFetch({ alias });
    await assert.rejects(
      snapshotStagingAlias({ env: ENV, fetchImpl: fixture.fetchImpl }),
      /canonical staging alias|redirect|deploymentId/u
    );
  }
});
test('snapshot rejects alias project and foreign deployment ownership', async () => {
  for (const [alias, deployment] of [
    [{ ...ALIAS_STATE, projectId: 'prj_foreign' }],
    [undefined, { ...DEPLOYMENT, id: 'dpl_foreign' }],
    [undefined, { ...DEPLOYMENT, projectId: 'prj_foreign' }],
    [undefined, { ...DEPLOYMENT, teamId: 'team_foreign' }],
  ]) {
    const fixture = snapshotFetch({ alias, deployment });
    await assert.rejects(
      snapshotStagingAlias({ env: ENV, fetchImpl: fixture.fetchImpl }),
      /project ownership mismatch|deployment project\/team ownership mismatch/u
    );
  }
});
test('snapshot rejects missing or malformed build commits', async () => {
  const fixture = snapshotFetch();
  for (const commitSha of [undefined, 'ABC123', 'b'.repeat(39)]) {
    await assert.rejects(
      snapshotStagingAlias({
        env: ENV,
        fetchImpl: fixture.fetchImpl,
        healthImpl: async () => JSON.stringify({ build: { commitSha } }),
      }),
      /full lowercase commit SHA/u
    );
  }
});
test('provider errors are bounded and redact secrets', async () => {
  await assert.rejects(
    snapshotStagingAlias({
      env: ENV,
      fetchImpl: async () =>
        response(`token=${ENV.VERCEL_TOKEN} ${'provider-noise '.repeat(200)}`, 503),
    }),
    error => {
      assert.doesNotMatch(error.message, new RegExp(ENV.VERCEL_TOKEN));
      assert.ok(error.message.length < 300);
      return true;
    }
  );
});
test('restore assigns only the canonical alias and verifies the exact preimage commit', async () => {
  const fixture = restoreFixture();
  await restoreStagingAlias(fixture.options);
  assert.deepEqual(fixture.calls, [DIRECT_HEALTH, ALIAS_MOVE, CANONICAL_HEALTH]);
});
for (const [name, failOnHealth, expectedCalls] of [
  ['never moves the alias when direct preimage health fails', 1, [DIRECT_HEALTH]],
  [
    'keeps a post-move canonical mismatch hard red',
    2,
    [DIRECT_HEALTH, ALIAS_MOVE, CANONICAL_HEALTH],
  ],
]) {
  test(`restore ${name}`, async () => {
    const fixture = restoreFixture(failOnHealth);
    await assert.rejects(restoreStagingAlias(fixture.options), /provenance mismatch/u);
    assert.deepEqual(fixture.calls, expectedCalls);
  });
}
