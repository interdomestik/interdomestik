import assert from 'node:assert/strict';
import test from 'node:test';

import { requestVercelHealth } from './fetch-vercel-health.mjs';

test('requestVercelHealth forces IPv4 only for the opted-in staging process', async () => {
  const calls = [];
  const execFileImpl = async (file, args) => {
    calls.push({ file, args });
    return { stdout: '{}\n__INTERDOMESTIK_HEALTH_STATUS__:200' };
  };
  const url = new URL('https://interdomestik-web-git-main-ecohub.vercel.app/api/health');

  await requestVercelHealth(url, {}, 1_000, execFileImpl, {
    INTERDOMESTIK_VERCEL_IPV4_ONLY: '1',
  });
  await requestVercelHealth(url, {}, 1_000, execFileImpl, {});

  assert.equal(calls[0].file, 'curl');
  assert.equal(calls[0].args.includes('--ipv4'), true);
  assert.equal(calls[0].args.includes('--silent'), true);
  assert.equal(calls[0].args.at(-1), url.href);
  assert.equal(calls[1].args.includes('--ipv4'), false);
});
