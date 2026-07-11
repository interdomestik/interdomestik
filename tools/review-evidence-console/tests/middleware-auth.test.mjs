import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import middleware from '../middleware.js';

const KEYS = [
  'REVIEW_PORTAL_AUTH_MODE',
  'REVIEW_PORTAL_BASIC_USER',
  'REVIEW_PORTAL_BASIC_PASSWORD_HASH',
];

const passwordHash = value => createHash('sha256').update(value).digest('hex');
const authorization = (user, password) =>
  `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;

async function withEnvironment(values, run) {
  const before = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
  for (const key of KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return await run();
  } finally {
    for (const key of KEYS) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

const request = header =>
  new Request('https://reviewer.example.test/', {
    headers: header ? { authorization: header } : {},
  });

const configured = {
  REVIEW_PORTAL_AUTH_MODE: 'basic',
  REVIEW_PORTAL_BASIC_USER: 'reviewer',
  REVIEW_PORTAL_BASIC_PASSWORD_HASH: passwordHash('correct-password'),
};

async function expectUnauthorized(values, header) {
  const response = await withEnvironment(values, () => middleware(request(header)));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('www-authenticate'), /^Basic realm=/);
  assert.doesNotMatch(await response.text(), /reviewer|correct-password|sha256/i);
}

test('middleware fails closed when mode, user, hash, or authorization is missing', async () => {
  await expectUnauthorized({}, null);
  await expectUnauthorized({ ...configured, REVIEW_PORTAL_BASIC_USER: undefined }, null);
  await expectUnauthorized({ ...configured, REVIEW_PORTAL_BASIC_PASSWORD_HASH: undefined }, null);
  await expectUnauthorized(configured, null);
});

test('middleware rejects malformed, wrong-user, and wrong-password credentials', async () => {
  await expectUnauthorized(configured, 'Basic !!!');
  await expectUnauthorized(configured, authorization('other', 'correct-password'));
  await expectUnauthorized(configured, authorization('reviewer', 'wrong-password'));
});

test('middleware allows only the exact configured user and password hash', async () => {
  const result = await withEnvironment(configured, () =>
    middleware(request(authorization('reviewer', 'correct-password')))
  );
  assert.equal(result, undefined);
});
