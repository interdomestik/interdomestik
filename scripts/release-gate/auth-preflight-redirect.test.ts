import assert from 'node:assert/strict';
import test from 'node:test';

const { isTrustedAuthPreflightRedirect } = require('./auth-preflight-redirect.ts');

const endpoint = new URL(
  '/api/auth/get-session?disableCookieCache=true&disableRefresh=true',
  'https://interdomestik-preview.vercel.app'
);

function redirectResponse(location: string) {
  return new Response('', { status: 307, headers: { Location: location } });
}

test('auth preflight redirect validator accepts same-origin auth redirects', () => {
  assert.equal(
    isTrustedAuthPreflightRedirect(
      endpoint,
      redirectResponse('/api/auth/get-session/?disableCookieCache=true&disableRefresh=true')
    ),
    true
  );
});

test('auth preflight redirect validator rejects cross-origin redirects', () => {
  assert.equal(
    isTrustedAuthPreflightRedirect(endpoint, redirectResponse('https://vercel.com/sso')),
    false
  );
});

test('auth preflight redirect validator rejects same-origin non-auth redirects', () => {
  assert.equal(isTrustedAuthPreflightRedirect(endpoint, redirectResponse('/login')), false);
});
