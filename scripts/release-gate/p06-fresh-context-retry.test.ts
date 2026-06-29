import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { collectP06MultiRouteScenario } = require('./p06-multi-route-runner.ts');

test('P0.6 retries a positive not-found in a fresh browser context', async () => {
  const loginCalls = [];
  const closedContexts = [];
  let contextCount = 0;
  const browser = {
    async newContext() {
      const contextId = contextCount;
      contextCount += 1;
      return {
        async newPage() {
          return { contextId };
        },
        async close() {
          closedContexts.push(contextId);
        },
      };
    },
  };

  const s2 = await collectP06MultiRouteScenario({
    id: 'S2',
    accountKey: 'staff',
    browser,
    checks: [
      { route: '/staff', expected: { staff: true } },
      { route: '/agent', expected: { agent: false } },
      { route: '/admin', expected: { admin: false } },
    ],
    runCtx: { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' },
    loginWithRunContext: async (_page, _runCtx, accountKey, options) => {
      loginCalls.push({ accountKey, forceFresh: options?.forceFresh === true });
    },
    assertP06Markers: async (page, _accountKey, _scenarioId, url, expected) =>
      markerAssertionFor(page.contextId, url, expected),
  });

  assert.ok(s2, 'expected P0.6 scenario S2 to run');
  assert.deepEqual(
    loginCalls.map(call => call.forceFresh),
    [false, true]
  );
  assert.deepEqual(closedContexts, [0, 1]);
  assert.match(s2.observedSummary, /retry=fresh-context/);
  assert.equal(s2.mismatches.length, 0);
});

function markerAssertionFor(contextId, url, expected) {
  const firstAttemptStaffRoute = contextId === 0 && expected.staff === true;
  const observed = firstAttemptStaffRoute
    ? observedMarkers({ staff: false, notFound: true })
    : observedMarkers({ staff: expected.staff === true, notFound: expected.staff !== true });
  const mismatches =
    expected.staff === true && observed.staff !== true
      ? ['staff expected true observed false']
      : [];
  return {
    label: 'S2',
    url,
    expected,
    observed,
    status: mismatches.length === 0 ? 'PASS' : 'FAIL',
    mismatches,
  };
}

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
