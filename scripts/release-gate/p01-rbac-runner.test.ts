import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { runP01, shouldRetryP01FreshContext } = require('./p01-rbac-runner.ts');
import { createPage, createStabilizingPage } from './p01-rbac-runner.test-support.ts';

test('P0.1 retries a positive canonical not-found in a fresh browser context', async () => {
  const loginCalls: Array<{ account: string; forceFresh: boolean }> = [];
  const contextModes: string[] = [];
  const browser = {
    async newContext() {
      const contextId = contextModes.length;
      contextModes.push('cached');
      return {
        async newPage() {
          return createPage(contextId, contextModes);
        },
        async close() {},
      };
    },
  };
  const runCtx = { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' };

  const result = await runP01(browser, runCtx, {
    loginWithRunContext: async (
      page: any,
      _runCtx: unknown,
      account: string,
      options?: { forceFresh?: boolean }
    ) => {
      page.account = account;
      contextModes[page.contextId] = options?.forceFresh === true ? 'fresh' : 'cached';
      loginCalls.push({ account, forceFresh: options?.forceFresh === true });
    },
  });

  assert.equal(result.status, 'PASS');
  assert.ok(result.evidence.includes('retry=fresh-context account=staff'));
  assert.ok(loginCalls.some(call => call.account === 'staff' && call.forceFresh === true));
  assert.ok(result.signatures.length === 0);
  assert.equal((runCtx as any).p01CanonicalProofByAccount.get('agent')?.marker, 'agent');
  assert.equal((runCtx as any).p01CanonicalProofByAccount.get('staff')?.marker, 'staff');
});

test('P0.1 polls within a bounded window for canonical not-found stabilization', async () => {
  const loginCalls: Array<{ account: string; forceFresh: boolean }> = [];
  const slept: number[] = [];
  const attemptsByAccount = new Map<string, number>();
  const browser = {
    async newContext() {
      return {
        async newPage() {
          return createStabilizingPage();
        },
        async close() {},
      };
    },
  };
  const runCtx = { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' };

  const result = await runP01(browser, runCtx, {
    loginWithRunContext: async (
      page: any,
      _runCtx: unknown,
      account: string,
      options?: { forceFresh?: boolean }
    ) => {
      page.account = account;
      page.loginAttempt = (attemptsByAccount.get(account) || 0) + 1;
      attemptsByAccount.set(account, page.loginAttempt);
      loginCalls.push({ account, forceFresh: options?.forceFresh === true });
    },
    sleep: async (ms: number) => {
      slept.push(ms);
    },
    stabilizationRetryIntervalMs: 750,
    stabilizationRetryWindowMs: 750,
  });

  assert.equal(result.status, 'PASS');
  assert.ok(result.evidence.includes('retry=fresh-context account=agent'));
  assert.ok(
    result.evidence.some(item => item.startsWith('retry=stabilized-fresh-context account=agent'))
  );
  assert.deepEqual(slept, [750]);
  assert.equal(
    loginCalls.filter(call => call.account === 'agent' && call.forceFresh === true).length,
    2
  );
  assert.equal((runCtx as any).p01CanonicalProofByAccount.get('agent')?.marker, 'agent');
});

test('P0.1 fresh retry is limited to positive canonical not-found failures', () => {
  assert.equal(
    shouldRetryP01FreshContext({
      positiveCanonicalNotFound: true,
      failures: [
        'P0.1_RBAC_CANONICAL_MARKER_MISSING account=staff route=/en/staff expected=staff visible={"member":false,"agent":false,"staff":false,"admin":false,"notFound":true,"rolesTable":false}',
      ],
    }),
    true
  );
});

test('P0.1 fresh retry preserves unrelated RBAC failures', () => {
  assert.equal(
    shouldRetryP01FreshContext({
      positiveCanonicalNotFound: true,
      failures: [
        'P0.1_RBAC_CANONICAL_MARKER_MISSING account=staff route=/en/staff expected=staff visible={"member":false,"agent":false,"staff":false,"admin":false,"notFound":true,"rolesTable":false}',
        'P0.1_RBAC_MARKER_MISMATCH account=staff route=/en/member must_absent=admin visible={"member":true,"agent":false,"staff":false,"admin":true,"notFound":false,"rolesTable":false}',
      ],
    }),
    false
  );
});
