import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { runP03AndP04 } = require('./admin-checks.ts');
const {
  createRolePanelFailureCapture,
  createSanitizedRolePanelFailureSnapshot,
} = require('./role-panel-failure-snapshot.ts');

test('role-panel failure snapshot retains only allowlisted diagnostic evidence', () => {
  const expectedEmail = 'private.admin@example.com';
  const snapshot = createSanitizedRolePanelFailureSnapshot({
    baseUrl: 'https://staging.interdomestik.com',
    expectedEmail,
    session: {
      status: 200,
      payload: {
        session: { token: 'session-secret' },
        user: {
          email: expectedEmail,
          name: 'Private Admin',
          role: 'tenant_admin',
          tenantId: 'tenant_ks',
          accessTenantId: null,
        },
      },
    },
    attempts: [
      {
        responseStatus: 200,
        finalUrl:
          'https://staging.interdomestik.com/en/admin/users/private-user-id?tenantId=tenant_ks&token=url-secret',
        title: 'Private Admin account',
        responseBody:
          '<main data-testid="admin-page-ready"><table data-testid="user-roles-table">Private Admin</table></main>',
        markers: {
          roleSelectTrigger: { count: 0, visible: false },
          userRolesTable: { count: 0, visible: false },
          adminReady: { count: 1, visible: true },
          notFound: { count: 0, visible: false },
          nextErrorBoundary: { count: 0, visible: false },
        },
      },
    ],
    browserErrors: [
      {
        source: 'console',
        message: `Hydration failed for Private Admin ${expectedEmail} token=browser-secret`,
        url: 'https://staging.interdomestik.com/en/admin/users/private-user-id',
      },
    ],
    failedRequests: [
      {
        method: 'GET',
        url: 'https://staging.interdomestik.com/_next/static/chunks/private.js?token=request-secret',
        errorText: 'net::ERR_CONNECTION_RESET Private Admin',
        resourceType: 'script',
        headers: {},
      },
    ],
    errorResponses: [
      {
        status: 500,
        url: `https://staging.interdomestik.com/api/private?email=${expectedEmail}`,
        resourceType: 'fetch',
        headers: { rsc: '1' },
      },
    ],
  });

  assert.deepEqual(snapshot.session, {
    status: 200,
    identityMatchesExpected: true,
    role: 'tenant_admin',
    tenantId: 'tenant_ks',
    accessTenantId: null,
  });
  assert.deepEqual(snapshot.attempts[0], {
    responseStatus: 200,
    finalUrl: 'https://staging.interdomestik.com/en/admin/users/[REDACTED_ID]',
    title: 'redacted',
    markers: {
      roleSelectTrigger: { count: 0, visible: false },
      userRolesTable: { count: 0, visible: false },
      adminReady: { count: 1, visible: true },
      notFound: { count: 0, visible: false },
      nextErrorBoundary: { count: 0, visible: false },
    },
    originalDocument: {
      roleSelectTriggerMarkup: false,
      userRolesTableMarkup: true,
      adminReadyMarkup: true,
      notFoundMarkup: false,
    },
    navigationErrorCategory: null,
  });
  assert.deepEqual(snapshot.browserErrors, [
    {
      source: 'console',
      category: 'hydration',
      url: 'https://staging.interdomestik.com/en/admin/users/[REDACTED_ID]',
    },
  ]);
  assert.deepEqual(snapshot.failedRequests, [
    {
      method: 'GET',
      kind: 'asset',
      url: 'https://staging.interdomestik.com/_next/[ASSET]',
      reasonCategory: 'network',
    },
  ]);
  assert.deepEqual(snapshot.errorResponses, [
    {
      status: 500,
      kind: 'rsc',
      url: 'https://staging.interdomestik.com/[REDACTED_PATH]',
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /Private Admin|private\.admin|private-user-id|session-secret|url-secret|browser-secret|request-secret|@/u
  );
});

test('role-panel failure capture observes the failing page and detaches without retaining raw data', async () => {
  const events = new EventEmitter();
  const expectedEmail = 'private.admin@example.com';
  const finalUrl =
    'https://staging.interdomestik.com/en/admin/users/private-user-id?token=url-secret';
  const page = {
    locator: () => ({
      count: async () => 0,
      first: () => ({ isVisible: async () => false }),
    }),
    off: events.off.bind(events),
    on: events.on.bind(events),
    request: {
      get: async () => ({
        json: async () => ({
          session: { token: 'session-secret' },
          user: {
            accessTenantId: 'tenant_ks',
            email: expectedEmail,
            name: 'Private Admin',
            role: 'admin',
            tenantId: 'tenant_ks',
          },
        }),
        ok: () => true,
        status: () => 200,
      }),
    },
    title: async () => 'Private Admin account',
    url: () => finalUrl,
  };
  const capture = createRolePanelFailureCapture(page, {
    baseUrl: 'https://staging.interdomestik.com',
    expectedEmail,
  });

  await capture.captureSession();
  events.emit('console', {
    location: () => ({ url: finalUrl }),
    text: () => `Hydration failed for ${expectedEmail} token=browser-secret`,
    type: () => 'error',
  });
  events.emit('requestfailed', {
    failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET browser-secret' }),
    headers: () => ({ authorization: 'Bearer request-secret' }),
    method: () => 'GET',
    resourceType: () => 'script',
    url: () =>
      'https://staging.interdomestik.com/_next/static/chunks/private.js?token=request-secret',
  });
  events.emit('response', {
    request: () => ({
      headers: () => ({ rsc: '1', authorization: 'Bearer response-secret' }),
      resourceType: () => 'fetch',
    }),
    status: () => 500,
    url: () => `https://staging.interdomestik.com/api/private?email=${expectedEmail}`,
  });
  await capture.captureAttempt({
    response: {
      status: () => 200,
      text: async () =>
        '<main data-testid="admin-page-ready">Private Admin private.admin@example.com</main>',
    },
  });

  const snapshot = capture.finish();

  assert.deepEqual(snapshot.session, {
    status: 200,
    identityMatchesExpected: true,
    role: 'admin',
    tenantId: 'tenant_ks',
    accessTenantId: 'tenant_ks',
  });
  assert.equal(snapshot.attempts[0].originalDocument.adminReadyMarkup, true);
  assert.equal(snapshot.browserErrors[0].category, 'hydration');
  assert.equal(snapshot.failedRequests[0].kind, 'asset');
  assert.equal(snapshot.errorResponses[0].kind, 'rsc');
  assert.equal(events.eventNames().length, 0);
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /Private Admin|private\.admin|private-user-id|session-secret|browser-secret|request-secret|response-secret|@/u
  );
});

test('P0.3/P0.4 unavailable-panel failure records the sanitized in-run snapshot', async () => {
  const priorTarget = process.env.RELEASE_GATE_TARGET_USER_URL;
  const originalNow = Date.now;
  process.env.RELEASE_GATE_TARGET_USER_URL = '/admin/users/golden_ks_a_member_1?tenantId=tenant_ks';
  let nowCalls = 0;
  Date.now = () => (nowCalls++ === 0 ? 0 : 31_000);

  const finalSnapshot = {
    schemaVersion: 1,
    session: {
      status: 200,
      identityMatchesExpected: true,
      role: 'tenant_admin',
      tenantId: 'tenant_ks',
      accessTenantId: null,
    },
    attempts: [],
    browserErrors: [],
    failedRequests: [],
    errorResponses: [],
  };
  const page = {
    currentUrl: 'https://staging.interdomestik.com/en/admin',
    locator: () => ({ isVisible: async () => false }),
    goto: async (url: string) => {
      page.currentUrl = url;
      return { status: () => 200 };
    },
    url: () => page.currentUrl,
  };
  const context = { newPage: async () => page, close: async () => {} };
  const browser = { newContext: async () => context };
  let captureFinished = false;

  try {
    const [p03, p04] = await runP03AndP04(
      browser,
      {
        baseUrl: 'https://staging.interdomestik.com',
        locale: 'en',
        credentials: { admin_ks: { email: 'private.admin@example.com' } },
      },
      {
        loginWithRunContext: async () => {},
        createRolePanelFailureCapture: () => ({
          captureSession: async () => {},
          captureAttempt: async () => {},
          finish: () => {
            captureFinished = true;
            return finalSnapshot;
          },
          dispose: () => {},
        }),
      }
    );

    assert.equal(p03.status, 'FAIL');
    assert.equal(p04.status, 'FAIL');
    assert.equal(captureFinished, true);
    const snapshotEvidence = p03.evidence.find((line: string) =>
      line.startsWith('role_panel_failure_snapshot=')
    );
    assert.equal(snapshotEvidence, `role_panel_failure_snapshot=${JSON.stringify(finalSnapshot)}`);
  } finally {
    Date.now = originalNow;
    if (priorTarget === undefined) delete process.env.RELEASE_GATE_TARGET_USER_URL;
    else process.env.RELEASE_GATE_TARGET_USER_URL = priorTarget;
  }
});
