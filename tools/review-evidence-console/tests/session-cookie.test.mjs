import assert from 'node:assert/strict';
import test from 'node:test';

import * as serverApp from '../server/app.mjs';

test('session cookie is host-only, secure, strict, httpOnly, and bounded', () => {
  assert.equal(typeof serverApp.sessionCookie, 'function');
  const value = serverApp.sessionCookie('signed-token', 28_800);
  assert.match(value, /^review_portal_session=signed-token;/);
  assert.match(value, /Path=\//);
  assert.match(value, /HttpOnly/);
  assert.match(value, /Secure/);
  assert.match(value, /SameSite=Strict/);
  assert.match(value, /Max-Age=28800/);
  assert.doesNotMatch(value, /Domain=/);
});

test('cookie parser reads only the exact session cookie and logout expires it', () => {
  assert.equal(
    serverApp.readSessionCookie('other=1; review_portal_session=abc.def; another=2'),
    'abc.def'
  );
  assert.equal(serverApp.readSessionCookie('review_portal_session_extra=value'), null);
  const expired = serverApp.clearSessionCookie();
  assert.match(expired, /^review_portal_session=;/);
  assert.match(expired, /Max-Age=0/);
  assert.match(expired, /HttpOnly/);
  assert.match(expired, /Secure/);
  assert.match(expired, /SameSite=Strict/);
});
