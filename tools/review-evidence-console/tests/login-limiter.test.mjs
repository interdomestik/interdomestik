import assert from 'node:assert/strict';
import test from 'node:test';

import { createLoginLimiter } from '../server/auth/login-limiter.mjs';

function request(headers) {
  return new Request('https://reviewer.example.test/api/session/login', { headers });
}

test('login limiter separates fallback proxy sources and uses the first forwarded IP', () => {
  const limiter = createLoginLimiter({ limit: 1, now: () => 1_000 });
  const first = request({ 'x-forwarded-for': '198.51.100.10, 10.0.0.1' });
  const same = request({ 'x-forwarded-for': '198.51.100.10' });
  const other = request({ 'x-real-ip': '198.51.100.11' });
  assert.equal(limiter.consume(first).allowed, true);
  assert.equal(limiter.consume(same).allowed, false);
  assert.equal(limiter.consume(other).allowed, true);
});

test('Vercel source takes precedence over fallback proxy headers', () => {
  const limiter = createLoginLimiter({ limit: 1, now: () => 1_000 });
  const headers = {
    'x-vercel-forwarded-for': '203.0.113.10',
    'x-forwarded-for': '198.51.100.20',
  };
  assert.equal(limiter.consume(request(headers)).allowed, true);
  assert.equal(
    limiter.consume(request({ 'x-vercel-forwarded-for': '203.0.113.10' })).allowed,
    false
  );
});
