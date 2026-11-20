import { describe, expect, it } from 'vitest';
import { NodeClient, defaultStackParser, type Event } from '@sentry/nextjs';
import { scrubSentryEvent, scrubSentrySpan } from './sentry-privacy';
import { scrubTransactionName } from './sentry-url-privacy';

describe('SDK request transaction grouping', () => {
  it.each([
    ['GET /en/login', 'GET /en/login'],
    ['POST /api/auth/sign-in/email', 'POST /api/auth/sign-in/email'],
    ['GET /en/member/claims/alice?next=private#otp', 'GET /en/member/claims/:id'],
    ['GET /en/member/claims/legal', 'GET /en/member/claims/:id'],
    ['GET /en/member/claims/clients', 'GET /en/member/claims/:id'],
    ['GET /en/member/benefits', 'GET /en/member/benefits'],
    ['GET /en/admin/analytics', 'GET /en/admin/analytics'],
    ['GET /api/health', 'GET /api/health'],
    ['GET /en/member/claims/alice@example.test', 'GET /en/member/claims/:id'],
    ['GET /en/member/claims/alice:private', 'GET /en/member/claims/:id'],
    ['GET /en/member/claims/(alice)', 'GET /en/member/claims/:id'],
    ['POST /api/documents/42/download?token=private#secret', 'POST /api/documents/:id/download'],
    ['/en/login?next=private#otp', '/en/login'],
    [
      'https://example.test/en/member/claims/alice?secret=private#otp',
      'https://[redacted-host]/en/member/claims/:id',
    ],
    ['Critical UI action', 'Critical UI action'],
    ['GET /[locale]/admin/claims/[id]', 'GET /[locale]/admin/claims/[id]'],
    ['/:id/member/settings', '/:id/member/settings'],
    ['GET /en/member/:id', 'GET /en/member/:id'],
    ['GET /api/:id', 'GET /api/:id'],
    ['GET /[locale]/(app)/dashboard/[[...slug]]', 'GET /[locale]/(app)/dashboard/[[...slug]]'],
    ['POST /api/auth/[...all]', 'POST /api/auth/[...all]'],
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
    'GET /[locale]/admin/claims/alice',
    'GET /[locale]/admin/claims/legal',
    'GET /[locale]/member/claims/clients',
    'GET /[locale]/admin/claims/alice@example.test',
    'GET /[locale]/admin/claims/123e4567-e89b-12d3-a456-426614174000',
    'GET /[alice]/member/settings',
    'GET /[locale]/(alice)/member',
    'GET /[locale]/../member/settings',
    'GET /[locale]/%2e%2e/member/settings',
    'GET /[locale]/admin?token=private',
    'GET /[locale]/admin#private',
    '/:private/member/settings',
    'GET /[locale]//admin',
  ])('fails closed for arbitrary or malformed label %s', input => {
    expect(scrubTransactionName(input)).toBe('[redacted]');
  });
  it.each([
    ['GET /en/login', 'GET /en/login'],
    ['POST /api/auth/sign-in/email', 'POST /api/auth/sign-in/email'],
    ['GET /en/member/claims/alice?next=private#otp', 'GET /en/member/claims/:id'],
    ['POST /api/documents/42/download?token=private#secret', 'POST /api/documents/:id/download'],
    ['GET /[locale]/admin/claims/[id]', 'GET /[locale]/admin/claims/[id]'],
    ['/:id/member/settings', '/:id/member/settings'],
    ['GET /en/member/benefits', 'GET /en/member/benefits'],
    ['GET /en/admin/analytics', 'GET /en/admin/analytics'],
    ['GET /api/health', 'GET /api/health'],
  ])(
    'preserves %s through the actual SDK root-span hook and transaction conversion',
    async (transaction, expected) => {
      const transactions: Event[] = [];
      const capturedEnvelopes: unknown[] = [];
      const client = new NodeClient({
        dsn: 'https://testkey@sentry.example/123',
        integrations: [],
        stackParser: defaultStackParser,
        tracesSampleRate: 1,
        beforeSendSpan: scrubSentrySpan,
        beforeSendTransaction: scrubSentryEvent,
        transport: () => ({
          send: envelope => {
            capturedEnvelopes.push(envelope);
            for (const item of envelope[1]) {
              if (item[0].type === 'transaction') transactions.push(item[1] as Event);
            }
            return Promise.resolve({ statusCode: 200 });
          },
          flush: () => Promise.resolve(true),
        }),
      });
      client.init();
      client.captureEvent({
        type: 'transaction',
        transaction,
        start_timestamp: 1,
        timestamp: 2,
        contexts: {
          trace: {
            trace_id: 'abcdef0123456789abcdef0123456789',
            span_id: 'abcdef0123456789',
            status: 'ok',
            op: 'http.server',
            data: {},
          },
        },
        spans: [
          {
            trace_id: 'abcdef0123456789abcdef0123456789',
            span_id: 'abcdef0123456780',
            start_timestamp: 1,
            timestamp: 2,
            op: 'db.query',
            description: 'SELECT private account facts',
            data: { 'db.statement': 'SELECT private' },
          },
          {
            trace_id: 'abcdef0123456789abcdef0123456789',
            span_id: 'abcdef0123456781',
            start_timestamp: 1,
            timestamp: 2,
            op: 'http.client',
            description: 'GET /en/login',
            data: {},
          },
        ],
      });
      expect(await client.flush(500)).toBe(true);
      const sent = transactions[0];
      expect(sent?.transaction).toBe(expected);
      expect(sent).toMatchObject({
        start_timestamp: 1,
        timestamp: 2,
        contexts: { trace: { status: 'ok' } },
      });
      expect(sent?.spans?.map(span => span.description)).toEqual(['[redacted]', '[redacted]']);
      const serializedEnvelope = JSON.stringify(capturedEnvelopes);
      for (const marker of [
        'private',
        'alice',
        '/documents/42/',
        '?next=',
        '?token=',
        '#otp',
        '#secret',
        'SELECT',
      ])
        expect(serializedEnvelope).not.toContain(marker);
      await client.close(500);
    }
  );
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
