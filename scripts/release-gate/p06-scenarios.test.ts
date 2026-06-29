import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { MARKERS } = require('./config.ts');
const { runP06 } = require('./admin-checks.ts');
const { buildP06CanonicalRouteScenarios } = require('./p06-scenarios.ts');

test('P0.6 canonical scenarios stay aligned with P0.1 role matrix', () => {
  const scenarios = buildP06CanonicalRouteScenarios();

  assert.deepEqual(
    scenarios.map(({ id, accountKey, checks }) => ({
      id,
      accountKey,
      checks: checks.map(({ route, expected }) => [route, expected]),
    })),
    [
      {
        id: 'S1',
        accountKey: 'agent',
        checks: [
          ['/agent', { agent: true }],
          ['/staff', { staff: false }],
          ['/admin', { admin: false }],
        ],
      },
      {
        id: 'S2',
        accountKey: 'staff',
        checks: [
          ['/staff', { staff: true }],
          ['/agent', { agent: false }],
          ['/admin', { admin: false }],
        ],
      },
    ]
  );
});

test('P0.6 account setup uses forceFresh login before scenario navigation', async () => {
  const loginCalls: Array<{ accountKey: string; forceFresh: boolean }> = [];
  let activePage: any = null;
  const browser = {
    async newContext() {
      return {
        async newPage() {
          activePage = createPage();
          return activePage;
        },
        async close() {},
      };
    },
  };

  await runP06(
    browser,
    { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' },
    {
      loginWithRunContext: async (
        _page: unknown,
        _runCtx: unknown,
        accountKey: string,
        options?: { forceFresh?: boolean }
      ) => {
        loginCalls.push({ accountKey, forceFresh: options?.forceFresh === true });
        activePage.currentAccount = accountKey;
      },
    }
  );

  assert.equal(loginCalls.length > 0, true);
  assert.equal(
    loginCalls.every(call => call.forceFresh),
    true
  );
});

function createPage(): any {
  return {
    currentAccount: '',
    currentUrl: '',
    async goto(url: string) {
      this.currentUrl = url;
    },
    locator(selector: string) {
      return {
        count: async () => markerCountFor(selector, this.currentAccount, this.currentUrl),
        isVisible: async () => false,
        first: () => ({
          isVisible: async () => false,
          innerText: async () => '',
        }),
      };
    },
    getByTestId() {
      return { isVisible: async () => false };
    },
    url() {
      return this.currentUrl || '';
    },
  };
}

function markerCountFor(selector: string, account: string, url: string): number {
  const route = new URL(url || 'https://interdomestik-web.vercel.app/en/member').pathname;
  const canonicalByAccount: Record<string, string> = {
    agent: '/en/agent',
    staff: '/en/staff',
    admin_ks: '/en/admin',
  };
  const markerByAccount: Record<string, string> = {
    agent: MARKERS.agent,
    staff: MARKERS.staff,
    admin_ks: MARKERS.admin,
  };
  const canonical = canonicalByAccount[account];
  const marker = markerByAccount[account];
  if (canonical && marker && route === canonical && selector.includes(marker)) return 1;
  if (canonical && route !== canonical && selector.includes(MARKERS.notFound)) return 1;
  return 0;
}
