import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchVercelHealth } from './fetch-vercel-health.mjs';

const PREVIEW_HEALTH_URL = 'https://interdomestik-web-git-main-ecohub.vercel.app/api/health';

function response(status, body = '{}') {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

test('fetchVercelHealth sends bypass header for Vercel preview hosts', async () => {
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  let receivedHeaders;
  await fetchVercelHealth({
    healthUrl: PREVIEW_HEALTH_URL,
    requestImpl: async (_url, headers) => {
      receivedHeaders = headers;
      return response(200);
    },
  });
  assert.equal(receivedHeaders['x-vercel-protection-bypass'], 'bypass-secret');
});

test('fetchVercelHealth allows Vercel deployment hosts without the web infix', async () => {
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  let receivedUrl;
  let receivedHeaders;
  await fetchVercelHealth({
    healthUrl: 'https://interdomestik-5w2sgjmdp-ecohub.vercel.app/api/health',
    requestImpl: async (url, headers) => {
      receivedUrl = url;
      receivedHeaders = headers;
      return response(200);
    },
  });
  assert.equal(receivedUrl.href, 'https://interdomestik-5w2sgjmdp-ecohub.vercel.app/api/health');
  assert.equal(receivedHeaders['x-vercel-protection-bypass'], 'bypass-secret');
});

test('fetchVercelHealth rejects redirects before reading health body', async () => {
  await assert.rejects(
    fetchVercelHealth({
      healthUrl: PREVIEW_HEALTH_URL,
      requestImpl: async () => response(307),
    }),
    /Health endpoint redirected/u
  );
});

test('fetchVercelHealth includes a sanitized non-OK response body', async () => {
  const body = JSON.stringify({
    status: 'unhealthy',
    services: {
      database: {
        status: 'unhealthy',
        error:
          'DATABASE_URL_RLS=postgresql://user:pass@example.com/app role posture could not be verified',
      },
    },
  });

  await assert.rejects(
    fetchVercelHealth({
      healthUrl: PREVIEW_HEALTH_URL,
      requestImpl: async () => response(503, body),
    }),
    error => {
      assert.match(error.message, /Health endpoint returned 503/u);
      assert.match(error.message, /DATABASE_URL_RLS=\[redacted\]/u);
      assert.doesNotMatch(error.message, /user:pass@example/u);
      return true;
    }
  );
});

test('fetchVercelHealth validates the deployed commit SHA', async () => {
  const body = JSON.stringify({ build: { commitSha: 'abc123' } });
  await fetchVercelHealth({
    healthUrl: PREVIEW_HEALTH_URL,
    expectedCommitSha: 'abc123',
    requestImpl: async () => response(200, body),
  });
  await assert.rejects(
    fetchVercelHealth({
      healthUrl: PREVIEW_HEALTH_URL,
      expectedCommitSha: 'def456',
      requestImpl: async () => response(200, body),
    }),
    /Deployed build provenance mismatch/u
  );
});

test('fetchVercelHealth handles canonical host bypass policy', async () => {
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  for (const [healthUrl, expectedBypass] of [
    ['https://www.interdomestik.com/api/health', undefined],
    ['https://staging.interdomestik.com/api/health', 'bypass-secret'],
  ]) {
    let receivedHeaders;
    await fetchVercelHealth({
      healthUrl,
      requestImpl: async (_url, headers) => {
        receivedHeaders = headers;
        return response(200);
      },
    });
    assert.equal(receivedHeaders['x-vercel-protection-bypass'], expectedBypass);
  }
});

test('fetchVercelHealth normalizes duplicate slashes in the health path', async () => {
  let receivedUrl;
  await fetchVercelHealth({
    healthUrl: 'https://interdomestik-web-git-main-ecohub.vercel.app//api/health',
    requestImpl: async url => {
      receivedUrl = url;
      return response(200);
    },
  });
  assert.equal(receivedUrl.href, PREVIEW_HEALTH_URL);
});

test('fetchVercelHealth rejects non-Vercel health targets before fetch', async () => {
  await assert.rejects(
    fetchVercelHealth({
      healthUrl: 'https://example.com/api/health',
      requestImpl: async () => response(200),
    }),
    /Health URL must use an allowed deployment host/u
  );
  await assert.rejects(
    fetchVercelHealth({
      healthUrl: PREVIEW_HEALTH_URL.replace('https:', 'http:'),
      requestImpl: async () => response(200),
    }),
    /Health URL must use https/u
  );
  await assert.rejects(
    fetchVercelHealth({
      healthUrl: PREVIEW_HEALTH_URL.replace('/api/health', '/api/status'),
      requestImpl: async () => response(200),
    }),
    /Health URL must target \/api\/health/u
  );
});
