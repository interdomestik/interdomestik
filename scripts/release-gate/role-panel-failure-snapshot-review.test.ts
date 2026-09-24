import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  createRolePanelFailureCapture,
  createSanitizedRolePanelFailureSnapshot,
} = require('./role-panel-failure-snapshot.ts');
const { findVisibleRolePanel } = require('./role-panel-discovery.ts');

test('role-panel failure snapshot categorizes unexpected session identifiers', () => {
  const snapshot = createSanitizedRolePanelFailureSnapshot({
    baseUrl: 'https://staging.interdomestik.com',
    expectedEmail: 'private.admin@example.com',
    session: {
      status: 200,
      payload: {
        user: {
          email: 'private.admin@example.com',
          role: 'token_like_private_role_123',
          tenantId: '46c2cf00-7ce7-4a23-b634-private000001',
          accessTenantId: 'private_access_tenant_123',
        },
      },
    },
  });

  assert.deepEqual(snapshot.session, {
    status: 200,
    identityMatchesExpected: true,
    role: 'unexpected',
    tenantId: 'unexpected',
    accessTenantId: 'unexpected',
  });
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /token_like|46c2cf00|private_access|private\.admin|@/u
  );
});

test('role-panel failure capture bounds live event buffers before sanitization', () => {
  const events = new EventEmitter();
  let consoleTextCalls = 0;
  let failedRequestMethodCalls = 0;
  let errorResponseRequestCalls = 0;
  const page = {
    locator: () => ({
      count: async () => 0,
      first: () => ({ isVisible: async () => false }),
    }),
    off: events.off.bind(events),
    on: events.on.bind(events),
    request: { get: async () => null },
    title: async () => '',
    url: () => 'https://staging.interdomestik.com/en/admin',
  };
  const capture = createRolePanelFailureCapture(page, {
    baseUrl: 'https://staging.interdomestik.com',
    expectedEmail: 'private.admin@example.com',
  });

  for (let index = 0; index < 25; index += 1) {
    events.emit('console', {
      location: () => ({ url: page.url() }),
      text: () => {
        consoleTextCalls += 1;
        return `error-${index}`;
      },
      type: () => 'error',
    });
    events.emit('requestfailed', {
      failure: () => ({ errorText: `failure-${index}` }),
      headers: () => ({}),
      method: () => {
        failedRequestMethodCalls += 1;
        return 'GET';
      },
      resourceType: () => 'fetch',
      url: () => `https://staging.interdomestik.com/api/failure-${index}`,
    });
    events.emit('response', {
      request: () => {
        errorResponseRequestCalls += 1;
        return { headers: () => ({}), resourceType: () => 'fetch' };
      },
      status: () => 500,
      url: () => `https://staging.interdomestik.com/api/error-${index}`,
    });
  }

  capture.finish();

  assert.equal(consoleTextCalls, 20);
  assert.equal(failedRequestMethodCalls, 20);
  assert.equal(errorResponseRequestCalls, 20);
});

test('role-panel discovery does not retain a login response after a retry navigation fails', async () => {
  const targetUrl = 'https://staging.interdomestik.com/en/admin/users/redacted';
  const loginResponse = { status: () => 200, text: async () => '<main>login</main>' };
  const capturedAttempts = [];
  let navigationCalls = 0;
  const page = {
    currentUrl: targetUrl,
    goto: async () => {
      navigationCalls += 1;
      if (navigationCalls === 1) {
        page.currentUrl = 'https://staging.interdomestik.com/en/login';
        return loginResponse;
      }
      throw new Error('admin navigation failed');
    },
    url: () => page.currentUrl,
  };

  const resolved = await findVisibleRolePanel({
    failureCapture: {
      captureAttempt: async input => capturedAttempts.push(input),
    },
    loginWithRunContext: async () => {},
    page,
    recordEvidence: () => {},
    rolePanelTarget: {
      allowFallbackDiscovery: false,
      source: 'override',
      targetUrl,
    },
    runCtx: {},
  });

  assert.equal(resolved, null);
  assert.equal(navigationCalls, 2);
  assert.equal(capturedAttempts.length, 1);
  assert.equal(capturedAttempts[0].response, null);
  assert.match(String(capturedAttempts[0].error), /admin navigation failed/u);
});
