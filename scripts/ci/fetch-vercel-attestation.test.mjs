import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchVercelAttestation,
  fetchVercelAttestationWithRetries,
} from './fetch-vercel-attestation.mjs';

function headers(location, contentType = 'application/json') {
  return {
    get: name => {
      if (name.toLowerCase() === 'location') return location;
      if (name.toLowerCase() === 'content-type') return contentType;
      return null;
    },
  };
}

function response(status, body = '', location, contentType) {
  return {
    headers: headers(location, contentType),
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Redirect',
    text: async () => body,
  };
}

test('fetchVercelAttestation follows one same-host HTTPS redirect', async () => {
  const calls = [];
  const metadata = '{"commitSha":"abc"}';
  const fetchImpl = async url => {
    calls.push(url.href);
    return calls.length === 1
      ? response(308, '', '/en/.well-known/interdomestik-release-attestation.json')
      : response(200, metadata);
  };

  const actual = await fetchVercelAttestation({
    metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
    fetchImpl,
  });

  assert.equal(actual, metadata);
  assert.deepEqual(calls, [
    'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
    'https://preview.vercel.app/en/.well-known/interdomestik-release-attestation.json',
  ]);
});

test('fetchVercelAttestation rejects cross-host redirects', async () => {
  const fetchImpl = async () =>
    response(302, '', 'https://example.com/.well-known/interdomestik-release-attestation.json');

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      fetchImpl,
    }),
    /crossed host boundary/u
  );
});

test('fetchVercelAttestation rejects redirect chains past the limit', async () => {
  const fetchImpl = async url => response(302, '', url.pathname.includes('/one') ? '/two' : '/one');

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      fetchImpl,
    }),
    /redirect limit exceeded/u
  );
});

test('fetchVercelAttestation rejects unsafe URLs and failed responses', async () => {
  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'http://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
    }),
    /must use https/u
  );

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      fetchImpl: async () => response(302),
    }),
    /missing Location header/u
  );

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      fetchImpl: async () => response(500),
    }),
    /Attestation fetch failed/u
  );
});

test('fetchVercelAttestation rejects non-JSON success responses', async () => {
  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      fetchImpl: async () => response(200, '<html></html>', undefined, 'text/html'),
    }),
    /expected JSON/u
  );
});

test('fetchVercelAttestation times out stalled requests', async () => {
  const fetchImpl = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      );
    });

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      fetchImpl,
      timeoutMs: 1,
    }),
    /aborted/u
  );
});

test('fetchVercelAttestationWithRetries retries transient failures', async () => {
  let calls = 0;
  const delays = [];
  const actual = await fetchVercelAttestationWithRetries({
    metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
    retries: 2,
    retryDelayMs: 5,
    sleepImpl: async ms => delays.push(ms),
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? response(503) : response(200, '{"ok":true}');
    },
  });

  assert.equal(actual, '{"ok":true}');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5, 5]);
});
