import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { MARKERS } = require('./config.ts');
const { assertP06UrlMarkers } = require('./p06-marker-assertion.ts');

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
