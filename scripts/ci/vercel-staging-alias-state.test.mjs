import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_STAGING_ALIAS,
  restoreStagingAlias,
  snapshotStagingAlias,
} from './vercel-staging-alias-state.mjs';

const COMMIT = 'a'.repeat(40);
const HOST = 'interdomestik-web-old-ecohub.vercel.app';
const ENV = {
  VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret',
  VERCEL_ORG_ID: 'team_expected',
  VERCEL_PROJECT_ID: 'prj_expected',
  VERCEL_TOKEN: 'token-secret',
};

function response(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

function snapshotFetch({
  alias = { alias: CANONICAL_STAGING_ALIAS, deployment: { url: HOST }, redirect: null },
  deployment = { projectId: ENV.VERCEL_PROJECT_ID, teamId: ENV.VERCEL_ORG_ID, url: HOST },
} = {}) {
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
  for (const call of fixture.calls) {
    assert.equal(call.init.headers.authorization, `Bearer ${ENV.VERCEL_TOKEN}`);
    assert.match(call.url, new RegExp(`teamId=${ENV.VERCEL_ORG_ID}`));
  }
});

test('snapshot fails closed for missing, redirected, or malformed aliases', async () => {
  for (const alias of [
    {},
    { alias: CANONICAL_STAGING_ALIAS, deployment: { url: HOST }, redirect: 'other.example' },
    {
      alias: CANONICAL_STAGING_ALIAS,
      deployment: { url: 'staging.interdomestik.com' },
      redirect: null,
    },
  ]) {
    const fixture = snapshotFetch({ alias });
    await assert.rejects(
      snapshotStagingAlias({ env: ENV, fetchImpl: fixture.fetchImpl }),
      /canonical staging alias|redirect|Vercel deployment hostname/u
    );
  }
});

test('snapshot rejects foreign project or team ownership', async () => {
  for (const deployment of [
    { projectId: 'prj_foreign', teamId: ENV.VERCEL_ORG_ID, url: HOST },
    { projectId: ENV.VERCEL_PROJECT_ID, teamId: 'team_foreign', url: HOST },
  ]) {
    const fixture = snapshotFetch({ deployment });
    await assert.rejects(
      snapshotStagingAlias({ env: ENV, fetchImpl: fixture.fetchImpl }),
      /project\/team ownership mismatch/u
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
  const calls = [];
  await restoreStagingAlias({
    commitSha: COMMIT,
    deploymentHostname: HOST,
    env: ENV,
    aliasImpl: async (...args) => calls.push(args),
    healthImpl: async ({ healthUrl, expectedCommitSha }) => {
      assert.equal(healthUrl, `https://${CANONICAL_STAGING_ALIAS}/api/health`);
      assert.equal(expectedCommitSha, COMMIT);
    },
  });
  assert.deepEqual(calls, [[HOST, CANONICAL_STAGING_ALIAS, ENV]]);
});

test('restore mismatch stays hard red', async () => {
  await assert.rejects(
    restoreStagingAlias({
      commitSha: COMMIT,
      deploymentHostname: HOST,
      env: ENV,
      aliasImpl: async () => {},
      healthImpl: async () => {
        throw new Error('Deployed build provenance mismatch');
      },
    }),
    /provenance mismatch/u
  );
});
