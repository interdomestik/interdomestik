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

test('P0.6 canonical scenarios reuse established sessions before forcing fresh login', async () => {
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

  const result = await runP06(
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
        activePage.sessionMode = options?.forceFresh === true ? 'fresh' : 'cached';
      },
    }
  );

  assert.equal(result.status, 'PASS');
  const firstAgentLogin = loginCalls.find(call => call.accountKey === 'agent');
  const firstStaffLogin = loginCalls.find(call => call.accountKey === 'staff');
  assert.equal(firstAgentLogin?.forceFresh, false);
  assert.equal(firstStaffLogin?.forceFresh, false);
});

function createPage(): any {
  return {
    currentAccount: '',
    sessionMode: 'cached',
    currentUrl: '',
    async goto(url: string) {
      this.currentUrl = url;
    },
    locator(selector: string) {
      return {
        count: async () =>
          markerCountFor(selector, this.currentAccount, this.currentUrl, this.sessionMode),
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

function markerCountFor(
  selector: string,
  account: string,
  url: string,
  sessionMode: string
): number {
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
  if (
    canonical &&
    marker &&
    route === canonical &&
    sessionMode === 'cached' &&
    selector.includes(marker)
  ) {
    return 1;
  }
  if (canonical && route !== canonical && selector.includes(MARKERS.notFound)) return 1;
  if (
    canonical &&
    route === canonical &&
    sessionMode === 'fresh' &&
    selector.includes(MARKERS.notFound)
  ) {
    return 1;
  }
  return 0;
}
