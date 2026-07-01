import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { recordP01CanonicalProof } = require('./p01-canonical-proof.ts');
const { collectP06MultiRouteScenario } = require('./p06-multi-route-runner.ts');

test('P0.6 reuses P0.1 canonical proof and still checks forbidden routes live', async () => {
  const loginCalls = [];
  const assertedUrls = [];
  const browser = {
    async newContext() {
      return {
        async newPage() {
          return {};
        },
        async close() {},
      };
    },
  };
  const runCtx = { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' };
  recordP01CanonicalProof(
    runCtx,
    'agent',
    '/agent',
    'agent',
    observedMarkers({ member: true, agent: true })
  );

  const result = await collectP06MultiRouteScenario({
    id: 'S1',
    accountKey: 'agent',
    browser,
    checks: [
      { route: '/agent', expected: { agent: true } },
      { route: '/staff', expected: { staff: false } },
      { route: '/admin', expected: { admin: false } },
    ],
    runCtx,
    loginWithRunContext: async (_page, _runCtx, accountKey, options) => {
      loginCalls.push({ accountKey, forceFresh: options?.forceFresh === true });
    },
    assertP06Markers: async (_page, _accountKey, _scenarioId, url, expected) => {
      assertedUrls.push(url);
      return {
        expected,
        label: 'S1',
        mismatches: [],
        observed: observedMarkers({ notFound: true }),
        status: 'PASS',
        url,
      };
    },
  });

  assert.deepEqual(assertedUrls, [
    'https://interdomestik-web.vercel.app/en/staff',
    'https://interdomestik-web.vercel.app/en/admin',
  ]);
  assert.deepEqual(loginCalls, [{ accountKey: 'agent', forceFresh: false }]);
  assert.match(
    result.observedSummary,
    /p01-proof https:\/\/interdomestik-web\.vercel\.app\/en\/agent/
  );
  assert.equal(result.mismatches.length, 0);
});

function observedMarkers(overrides) {
  return {
    member: false,
    agent: false,
    staff: false,
    admin: false,
    notFound: false,
    rolesTable: false,
    ...overrides,
  };
}
