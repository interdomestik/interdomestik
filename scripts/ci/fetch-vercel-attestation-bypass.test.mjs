import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchVercelAttestation } from './fetch-vercel-attestation.mjs';

function response(status, body = '', location) {
  return {
    headers: {
      get: name => {
        if (name.toLowerCase() === 'location') return location;
        if (name.toLowerCase() === 'content-type') return 'application/json';
        return null;
      },
    },
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

test('fetchVercelAttestation sends Vercel protection bypass header', async () => {
  let receivedHeaders;
  const fetchImpl = async (_url, init) => {
    receivedHeaders = init.headers;
    return response(200, '{"commitSha":"abc"}');
  };

  await fetchVercelAttestation({
    metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
    bypassSecret: 'secret-123',
    fetchImpl,
  });

  assert.equal(receivedHeaders['x-vercel-protection-bypass'], 'secret-123');
});

test('fetchVercelAttestation rejects Vercel SSO protection redirects', async () => {
  const fetchImpl = async () =>
    response(302, '', 'https://vercel.com/sso-api/login?url=https%3A%2F%2Fpreview.vercel.app');

  await assert.rejects(
    fetchVercelAttestation({
      metadataUrl: 'https://preview.vercel.app/.well-known/interdomestik-release-attestation.json',
      fetchImpl,
    }),
    /VERCEL_AUTOMATION_BYPASS_SECRET/u
  );
});
