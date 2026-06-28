import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { MARKERS } = require('./config.ts');
const { assertP06UrlMarkers, shouldForceFreshAfterNotFound } = require('./p06-marker-assertion.ts');

test('assertP06UrlMarkers uses session-aware navigation before collecting markers', async () => {
  let loginRetryCount = 0;
  const navigated = [];
  const page = {
    async goto(url) {
      navigated.push(url);
    },
    locator(selector) {
      return {
        count: async () => (selector === `[data-testid="${MARKERS.agent}"]:visible` ? 1 : 0),
        isVisible: async () => false,
      };
    },
    url: () => navigated.at(-1) || '',
  };

  const result = await assertP06UrlMarkers(
    page,
    'agent',
    'S1',
    'https://interdomestik-web.vercel.app/en/agent',
    { agent: true },
    {
      loginWithRunContext: async () => {
        loginRetryCount += 1;
      },
      runCtx: {},
    }
  );

  assert.equal(result.status, 'PASS');
  assert.equal(loginRetryCount, 0);
  assert.deepEqual(navigated, ['https://interdomestik-web.vercel.app/en/agent']);
});

test('assertP06UrlMarkers force-refreshes when cached session reaches not-found', async () => {
  let loginRetryCount = 0;
  const navigated = [];
  const page = {
    async goto(url) {
      navigated.push(url);
    },
    locator(selector) {
      return {
        count: async () => {
          const refreshed = loginRetryCount > 0;
          if (selector === `[data-testid="${MARKERS.notFound}"]:visible`) return refreshed ? 0 : 1;
          if (selector === `[data-testid="${MARKERS.staff}"]:visible`) return refreshed ? 1 : 0;
          return 0;
        },
        isVisible: async () => false,
      };
    },
    url: () => navigated.at(-1) || '',
  };

  const result = await assertP06UrlMarkers(
    page,
    'staff',
    'S2',
    'https://interdomestik-web.vercel.app/en/staff',
    { staff: true },
    {
      loginWithRunContext: async (_page, _runCtx, accountKey, options) => {
        assert.equal(accountKey, 'staff');
        assert.equal(options.forceFresh, true);
        loginRetryCount += 1;
      },
      runCtx: {},
    }
  );

  assert.equal(result.status, 'PASS');
  assert.equal(loginRetryCount, 1);
  assert.deepEqual(navigated, [
    'https://interdomestik-web.vercel.app/en/staff',
    'https://interdomestik-web.vercel.app/en/staff',
  ]);
});

test('shouldForceFreshAfterNotFound only retries positive-marker not-found failures', () => {
  assert.equal(
    shouldForceFreshAfterNotFound({
      status: 'FAIL',
      expected: { agent: true },
      observed: { notFound: true },
    }),
    true
  );
  assert.equal(
    shouldForceFreshAfterNotFound({
      status: 'FAIL',
      expected: { admin: false },
      observed: { notFound: true },
    }),
    false
  );
});
