import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { runP01, shouldRetryP01FreshContext } = require('./p01-rbac-runner.ts');

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

  const result = await runP01(
    browser,
    { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' },
    {
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
    }
  );

  assert.equal(result.status, 'PASS');
  assert.ok(result.evidence.includes('retry=fresh-context account=staff'));
  assert.ok(loginCalls.some(call => call.account === 'staff' && call.forceFresh === true));
  assert.ok(result.signatures.length === 0);
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

function createPage(contextId: number, contextModes: string[]): any {
  return {
    account: '',
    contextId,
    currentPath: '',
    async goto(url: string) {
      this.currentPath = new URL(url).pathname;
    },
    locator(selector: string) {
      return {
        count: async () =>
          markerCount(selector, this.account, this.currentPath, contextModes[contextId]),
        isVisible: async () => false,
      };
    },
    getByTestId() {
      return { isVisible: async () => false };
    },
    url() {
      return this.currentPath || '';
    },
  };
}

function markerCount(selector: string, account: string, path: string, mode: string): number {
  const testId = selector.match(/\[data-testid="([^"]+)"\]/)?.[1] || '';
  const canonicalPathByAccount: Record<string, string> = {
    member: '/en/member',
    agent: '/en/agent',
    staff: '/en/staff',
    admin_ks: '/en/admin',
  };
  const markerByAccount: Record<string, string> = {
    member: 'dashboard-page-ready',
    agent: 'agent-page-ready',
    staff: 'staff-page-ready',
    admin_ks: 'admin-page-ready',
  };

  if (account === 'staff' && path === '/en/staff' && mode !== 'fresh') {
    return testId === 'not-found-page' ? 1 : 0;
  }
  if (path === canonicalPathByAccount[account]) {
    return testId === markerByAccount[account] ? 1 : 0;
  }
  if (account === 'agent' && path === '/en/member') {
    return testId === 'dashboard-page-ready' ? 1 : 0;
  }
  if (account === 'admin_ks' && path === '/en/member') {
    return testId === 'dashboard-page-ready' || testId === 'admin-page-ready' ? 1 : 0;
  }
  return testId === 'not-found-page' ? 1 : 0;
}
