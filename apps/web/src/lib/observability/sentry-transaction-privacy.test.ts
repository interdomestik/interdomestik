import { describe, expect, it } from 'vitest';
import { scrubSentryEvent, scrubSentrySpan } from './sentry-privacy';
import { scrubTransactionName } from './sentry-url-privacy';

describe('SDK request transaction grouping', () => {
  it.each([
    ['GET /en/login', 'GET /en/login'],
    ['POST /api/auth/sign-in/email', 'POST /api/auth/sign-in/email'],
    ['GET /en/member/claims/alice?next=private#otp', 'GET /en/member/claims/:id'],
    ['POST /api/documents/42/download?token=private#secret', 'POST /api/documents/:id/download'],
    ['/en/login?next=private#otp', '/en/login'],
    [
      'https://example.test/en/member/claims/alice?secret=private#otp',
      'https://example.test/en/member/claims/:id',
    ],
    ['Critical UI action', 'Critical UI action'],
  ])('preserves fixed grouping and redacts dynamic data in %s', (input, expected) => {
    expect(scrubTransactionName(input)).toBe(expected);
    expect(
      scrubSentryEvent({
        type: 'transaction',
        transaction: input,
        start_timestamp: 1,
        timestamp: 2,
      })?.transaction
    ).toBe(expected);
  });
  it.each([
    'private account fact',
    'FETCH /en/login',
    'GET private-account',
    'GET  /en/login',
    'GET //private.example/account',
    'GET /en/login raw-fact',
    'POST javascript:private',
    '',
    'middleware private',
  ])('fails closed for arbitrary or malformed label %s', input => {
    expect(scrubTransactionName(input)).toBe('[redacted]');
  });
  it('retains only a sanitized source http.route attribute, with timing/status intact', () => {
    const span = scrubSentrySpan({
      trace_id: 'trace',
      span_id: 'span',
      start_timestamp: 1,
      timestamp: 2,
      op: 'http.server',
      status: 'ok',
      data: {
        'http.route': '/api/documents/alice/download?secret=private#otp',
        'http.query': 'secret=private',
      },
    });
    expect(span).toMatchObject({
      start_timestamp: 1,
      timestamp: 2,
      status: 'ok',
      data: { 'http.route': '/api/documents/:id/download' },
    });
    expect(JSON.stringify(span)).not.toContain('private');
    const malformed = scrubSentrySpan({
      trace_id: 'trace',
      span_id: 'span',
      start_timestamp: 1,
      data: { 'http.route': 'raw private route' },
    });
    expect(malformed.data).not.toHaveProperty('http.route');
  });
});
