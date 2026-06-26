import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchVercelAttestation } from './fetch-vercel-attestation.mjs';

function headers(location) {
  return { get: name => (name.toLowerCase() === 'location' ? location : null) };
}

function response(status, body = '', location) {
  return {
    headers: headers(location),
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
    expectedHost: 'preview.vercel.app',
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
      expectedHost: 'preview.vercel.app',
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
      expectedHost: 'preview.vercel.app',
      fetchImpl,
    }),
    /redirect limit exceeded/u
  );
});

test('fetchVercelAttestation rejects unsafe URLs and failed responses', async () => {
  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'http://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      expectedHost: 'preview.vercel.app',
    }),
    /must use https/u
  );

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      expectedHost: 'preview.vercel.app',
      fetchImpl: async () => response(302),
    }),
    /missing Location header/u
  );

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      expectedHost: 'preview.vercel.app',
      fetchImpl: async () => response(500),
    }),
    /Attestation fetch failed/u
  );
});
