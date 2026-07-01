import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  accountKeyForRolePanelTarget,
  invalidateP01ProofForRoleTarget,
  recordP01CanonicalProof,
} = require('./p01-canonical-proof.ts');
const { collectP06MultiRouteScenario } = require('./p06-multi-route-runner.ts');

test('role-panel target invalidation is scoped to canonical fixture accounts', () => {
  const runCtx = createRunCtxWithAgentProof();
  assert.equal(accountKeyForRolePanelTarget(target('golden_ks_a_member_1')), 'member');
  assert.equal(invalidateP01ProofForRoleTarget(runCtx, target('golden_ks_a_member_1')), null);
  assert.equal((runCtx as any).p01CanonicalProofByAccount.get('agent')?.marker, 'agent');
  assert.equal(invalidateP01ProofForRoleTarget(runCtx, target('golden_ks_agent_a1')), 'agent');
  assert.equal((runCtx as any).p01CanonicalProofByAccount.has('agent'), false);
});

test('P0.6 live-checks canonical route when role-panel mutation invalidates proof', async () => {
  const assertedUrls = [];
  const runCtx = createRunCtxWithAgentProof();
  invalidateP01ProofForRoleTarget(runCtx, target('golden_ks_agent_a1'));

  const result = await collectP06MultiRouteScenario({
    id: 'S1',
    accountKey: 'agent',
    browser: browserStub(),
    checks: [
      { route: '/agent', expected: { agent: true } },
      { route: '/staff', expected: { staff: false } },
      { route: '/admin', expected: { admin: false } },
    ],
    runCtx,
    loginWithRunContext: async () => {},
    assertP06Markers: async (_page, _accountKey, _scenarioId, url, expected) => {
      assertedUrls.push(url);
      return {
        expected,
        label: 'S1',
        mismatches: [],
        observed: markers(url.endsWith('/agent') ? { agent: true } : { notFound: true }),
        status: 'PASS',
        url,
      };
    },
  });

  assert.deepEqual(assertedUrls, [
    'https://interdomestik-web.vercel.app/en/agent',
    'https://interdomestik-web.vercel.app/en/staff',
    'https://interdomestik-web.vercel.app/en/admin',
  ]);
  assert.doesNotMatch(result.observedSummary, /p01-proof/);
});

function createRunCtxWithAgentProof() {
  const runCtx = { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' };
  recordP01CanonicalProof(runCtx, 'agent', '/agent', 'agent', markers({ agent: true }));
  return runCtx;
}

function target(userId) {
  return `https://interdomestik-web.vercel.app/en/admin/users/${userId}?tenantId=tenant_ks`;
}

function browserStub() {
  return {
    async newContext() {
      return {
        async newPage() {
          return {};
        },
        async close() {},
      };
    },
  };
}

function markers(overrides) {
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
