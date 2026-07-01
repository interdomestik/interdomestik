import assert from 'node:assert/strict';
import test from 'node:test';

import { waitForVercelHealth } from './wait-for-vercel-health.mjs';

test('waitForVercelHealth retries until the health check succeeds', async () => {
  let calls = 0;
  const body = await waitForVercelHealth({
    healthUrl: 'https://staging.interdomestik.com/api/health',
    expectedCommitSha: 'abc123',
    attempts: 2,
    sleepMs: 0,
    log: () => {},
    fetchImpl: async params => {
      calls += 1;
      assert.equal(params.expectedCommitSha, 'abc123');
      if (calls === 1) throw new Error('not ready');
      return '{"ok":true}';
    },
  });
  assert.equal(calls, 2);
  assert.equal(body, '{"ok":true}');
});

test('waitForVercelHealth throws the final health error', async () => {
  await assert.rejects(
    waitForVercelHealth({
      healthUrl: 'https://staging.interdomestik.com/api/health',
      attempts: 2,
      sleepMs: 0,
      log: () => {},
      fetchImpl: async () => {
        throw new Error('still unhealthy');
      },
    }),
    /still unhealthy/u
  );
});
