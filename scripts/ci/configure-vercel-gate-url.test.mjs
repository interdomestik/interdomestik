import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  aliasStagingDeployment,
  cleanHostname,
  requireHostname,
  resolveGateUrl,
} from './configure-vercel-gate-url.mjs';

test('cleanHostname strips protocol, path, and port', () => {
  assert.equal(
    cleanHostname('https://Staging.Interdomestik.com/path:ignored'),
    'staging.interdomestik.com'
  );
  assert.equal(cleanHostname('deploy.example.vercel.app:443'), 'deploy.example.vercel.app');
});

test('requireHostname rejects unsafe alias values', () => {
  assert.throws(() => requireHostname('host', 'https://bad host.example'), /valid hostname/u);
  assert.throws(() => requireHostname('host', '-flag.example'), /valid hostname/u);
  assert.throws(() => requireHostname('host', 'bad..example'), /valid hostname/u);
  assert.throws(() => requireHostname('host', 'bad.example.'), /valid hostname/u);
  assert.throws(() => requireHostname('host', ''), /valid hostname/u);
});

test('resolveGateUrl keeps non-staging deploys on deployment host', async () => {
  const result = await resolveGateUrl('https://deploy.vercel.app', 'deploy.vercel.app', {
    DEPLOY_ENVIRONMENT: 'production',
    DEPLOY_PRODUCTION: 'true',
  });
  assert.deepEqual(result, {
    gateBaseUrl: 'https://deploy.vercel.app',
    gateHostname: 'deploy.vercel.app',
  });
});

test('resolveGateUrl aliases staging to canonical gate host', async () => {
  const calls = [];
  const result = await resolveGateUrl(
    'https://deploy.vercel.app',
    'deploy.vercel.app',
    { DEPLOY_ENVIRONMENT: 'staging', DEPLOY_PRODUCTION: 'false', VERCEL_TOKEN: 'token' },
    (...args) => calls.push(args)
  );
  assert.deepEqual(calls, [
    [
      'deploy.vercel.app',
      'staging.interdomestik.com',
      { DEPLOY_ENVIRONMENT: 'staging', DEPLOY_PRODUCTION: 'false', VERCEL_TOKEN: 'token' },
    ],
  ]);
  assert.deepEqual(result, {
    gateBaseUrl: 'https://staging.interdomestik.com',
    gateHostname: 'staging.interdomestik.com',
  });
});

test('aliasStagingDeployment assigns aliases through the Vercel REST API', async () => {
  const calls = [];
  await aliasStagingDeployment(
    'deploy.vercel.app',
    'staging.interdomestik.com',
    { VERCEL_TOKEN: 'token' },
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response('', { status: 200 });
    }
  );
  assert.equal(
    calls[0].url,
    'https://api.vercel.com/v2/deployments/deploy.vercel.app/aliases?teamSlug=ecohub'
  );
  assert.equal(calls[0].init.headers.authorization, 'Bearer token');
  assert.equal(calls[0].init.body, JSON.stringify({ alias: 'staging.interdomestik.com' }));
});

test('configure helper does not shell out for alias assignment', () => {
  const source = readFileSync(new URL('./configure-vercel-gate-url.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /child_process|execFileSync|process\.env,\s*stdio/u);
});
