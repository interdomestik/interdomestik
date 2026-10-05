import { describe, expect, it } from 'vitest';
import {
  isSentryTelemetryEnabled,
  resolveEnabledSampleRate,
  resolveSampleRate,
} from './sentry-sampling';
import { scrubSentryBreadcrumb, scrubSentryEvent, scrubSentrySpan } from './sentry-privacy';
import { scrubStackFilename, scrubUrl, toRouteFamily } from './sentry-url-privacy';
import { isReplaySafeLocation, replayPrivacyOptions } from './sentry-replay-privacy';

const dsn = 'https://publickey@sentry.example/123';
const privateUrl =
  'https://storage.example/storage/v1/object/sign/claim-evidence/tenant-alice/file.pdf?token=capability-secret#otp-code';

describe('Sentry sampling gates', () => {
  it('defaults modestly, preserves explicit zero and fails closed for malformed overrides', () => {
    expect(resolveSampleRate(undefined, 0.1)).toBe(0.1);
    for (const value of ['0', '', ' ', 'junk', '-1', '1.01', 'Infinity'])
      expect(resolveSampleRate(value, 0.1)).toBe(0);
    expect(resolveSampleRate('0.25', 0.1)).toBe(0.25);
    expect(resolveEnabledSampleRate(false, '1', 0.1)).toBe(0);
  });
  it('requires a usable DSN, production and a non-automated run', () => {
    expect(isSentryTelemetryEnabled({ dsn, nodeEnv: 'production', automated: false })).toBe(true);
    for (const invalid of [
      '',
      'not-a-dsn',
      'https://your-dsn@sentry.io/project-id',
      'https://sentry.example/123',
    ]) {
      expect(
        isSentryTelemetryEnabled({ dsn: invalid, nodeEnv: 'production', automated: false })
      ).toBe(false);
    }
    expect(isSentryTelemetryEnabled({ dsn, nodeEnv: 'test', automated: false })).toBe(false);
    expect(isSentryTelemetryEnabled({ dsn, nodeEnv: 'production', automated: true })).toBe(false);
  });
});

describe('privacy hooks', () => {
  it('collapses even short alphabetic IDs and encoded segments, stripping complete query and fragment', () => {
    expect(toRouteFamily('/en/member/claims/alice/documents/42')).toBe(
      '/en/member/claims/:id/documents/:id'
    );
    expect(
      scrubUrl('https://user:password@example.test/en/member/claims/%61lice?next=secret#otp')
    ).toBe('https://example.test/en/member/claims/:id');
    const safe = scrubUrl(privateUrl);
    for (const forbidden of ['capability-secret', 'otp-code', 'tenant-alice', 'file.pdf'])
      expect(safe).not.toContain(forbidden);
  });
  it('preserves strict hashed chunk URLs for source maps while removing query, fragment and private frame paths', () => {
    const chunk = 'https://example.test/_next/static/chunks/9889-a9108038039.js';
    expect(scrubStackFilename(`${chunk}?token=private#secret`)).toBe(chunk);
    expect(scrubStackFilename('https://example.test/en/member/claims/alice?token=private')).toBe(
      'https://example.test/en/member/claims/:id'
    );
    expect(scrubStackFilename('/Users/alice/private/claim.ts')).not.toContain('alice');
    const event = scrubSentryEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: `${chunk}?secret=private`,
                  abs_path: `${chunk}#secret`,
                  lineno: 22,
                  colno: 18,
                },
              ],
            },
          },
        ],
      },
    });
    expect(event?.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      filename: chunk,
      abs_path: chunk,
      lineno: 22,
      colno: 18,
    });
  });
  it('drops content, cookies, headers, user, SQL, arbitrary nested contexts and custom tags while preserving stack code', () => {
    const result = scrubSentryEvent({
      message: 'user fact email@example.test token-secret',
      request: {
        url: privateUrl,
        headers: { Authorization: 'Bearer secret' },
        cookies: { session: 'secret' },
        data: 'claim fact',
      },
      user: { id: 'customer-private', email: 'private@example.test' },
      extra: { draft: { facts: 'claim fact' } },
      contexts: { private: { facts: 'claim fact' } },
      tags: { ui_action: 'login_submit', ui_outcome: 'unexpected', tenant: 'tenant-private' },
      exception: {
        values: [
          {
            value: 'raw claim fact',
            mechanism: { type: 'custom', handled: false, data: { secret: 'secret' } },
            stacktrace: {
              frames: [
                {
                  filename: 'login-form.tsx',
                  lineno: 42,
                  context_line: 'await authClient.signIn.email(payload)',
                  vars: { password: 'secret' },
                },
              ],
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'secret',
      'claim fact',
      'private@example',
      'customer-private',
      'tenant-private',
    ])
      expect(serialized).not.toContain(forbidden);
    expect(result?.tags).toEqual({ ui_action: 'login_submit', ui_outcome: 'unexpected' });
    expect(result?.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      filename: 'login-form.tsx',
      lineno: 42,
      context_line: 'await authClient.signIn.email(payload)',
    });
  });
  it('removes raw SQL and breadcrumb facts but retains numeric status and safe route families', () => {
    const span = scrubSentrySpan({
      span_id: 'span',
      trace_id: 'trace',
      start_timestamp: 1,
      op: 'db',
      description: 'SELECT private facts',
      data: {
        'db.statement': 'SELECT email FROM users',
        'http.query': '?secret=true',
        'http.url': privateUrl,
        'http.status_code': 200,
      },
    });
    expect(span.description).toBe('[redacted]');
    expect(span.data).toMatchObject({ 'http.status_code': 200 });
    expect(JSON.stringify(span)).not.toContain('SELECT');
    expect(JSON.stringify(span)).not.toContain('secret');
    expect(scrubSentryBreadcrumb({ category: 'console', message: 'password' })).toBeNull();
    expect(
      scrubSentryBreadcrumb({
        category: 'fetch',
        message: 'raw fact',
        data: { url: privateUrl, body: 'raw fact' },
      })?.message
    ).toBeUndefined();
  });
  it('preserves the three existing source-owned D07 alert labels while removing tenant/claim tags and unknown labels', () => {
    for (const slo_alert of [
      'd07.api.claims.latency',
      'd07.document.download',
      'd07.webhook.processing',
    ]) {
      expect(
        scrubSentryEvent({
          tags: { slo_alert, tenant_id: 'private-tenant', claim_id: 'private-claim' },
        })?.tags
      ).toEqual({ slo_alert });
    }
    expect(scrubSentryEvent({ tags: { slo_alert: 'd07.raw.private-claim' } })?.tags).toEqual({});
  });
  it('retains SDK transaction success/failure status for D07 failure-rate rules without trace payloads', () => {
    for (const status of ['ok', 'internal_error', 'deadline_exceeded', 'cancelled']) {
      const event = scrubSentryEvent({
        type: 'transaction',
        tags: { slo_alert: 'd07.webhook.processing', tenant_id: 'private-tenant' },
        contexts: {
          trace: {
            trace_id: 'sdk-trace',
            span_id: 'sdk-span',
            status,
            data: { private: 'claim-private' },
            op: 'private-claim',
          },
        },
      });
      expect(event?.tags).toEqual({ slo_alert: 'd07.webhook.processing' });
      expect(event?.contexts?.trace).toMatchObject({
        trace_id: 'sdk-trace',
        span_id: 'sdk-span',
        status,
      });
      expect(JSON.stringify(event)).not.toContain('private');
    }
    expect(
      scrubSentryEvent({
        contexts: {
          trace: { span_id: 'sdk-span', trace_id: 'sdk-trace', status: 'private claim fact' },
        },
      })?.contexts?.trace?.status
    ).toBeUndefined();
  });
  it('preserves only SDK-shaped 32hex Replay linkage tags and drops arbitrary replay contexts', () => {
    const replayId = 'abcdef0123456789abcdef0123456789';
    expect(
      scrubSentryEvent({
        tags: { replayId, claim_id: 'private' },
        contexts: { replay: { facts: 'private' } },
      })?.tags
    ).toEqual({ replayId });
    expect(
      scrubSentryEvent({ tags: { replayId }, contexts: { replay: { facts: 'private' } } })?.contexts
    ).toEqual({});
    for (const invalid of ['private-claim', 'abcdef0123456789', 'z'.repeat(32), replayId + 'x']) {
      expect(scrubSentryEvent({ tags: { replayId: invalid } })?.tags).toEqual({});
    }
  });
  it('keeps only fixed critical failure messages', () => {
    expect(scrubSentryEvent({ message: 'Critical UI action failed' })?.message).toBe(
      'Critical UI action failed'
    );
    expect(scrubSentryEvent({ message: 'password=secret' })?.message).toBeUndefined();
  });
});

describe('limited Replay privacy', () => {
  it('allows only inspected login without query/hash, masking attrs/media and dropping all custom network/console records', () => {
    expect(isReplaySafeLocation('https://example.test/en/login')).toBe(true);
    expect(isReplaySafeLocation('https://example.test/en')).toBe(true);
    for (const path of [
      '/en/login?next=private',
      '/en/login#otp',
      '/en/member',
      '/en/member/claims/alice',
      '/en/register',
      '/en/free-start',
    ])
      expect(isReplaySafeLocation(`https://example.test${path}`)).toBe(false);
    expect(replayPrivacyOptions).toMatchObject({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkCaptureBodies: false,
      unmask: [],
      unblock: [],
    });
    expect(replayPrivacyOptions?.maskAttributes).toEqual(
      expect.arrayContaining(['href', 'src', 'title', 'value'])
    );
    expect(replayPrivacyOptions?.block).toEqual(
      expect.arrayContaining(['svg', 'canvas', 'iframe', '[data-testid="free-start-intake-shell"]'])
    );
    const filter = replayPrivacyOptions?.beforeAddRecordingEvent;
    expect(
      filter?.({
        type: 5,
        timestamp: 1,
        data: {
          tag: 'performanceSpan',
          payload: {
            op: 'resource.fetch',
            description: privateUrl,
            startTimestamp: 1,
            endTimestamp: 2,
            data: { url: privateUrl },
          },
        },
      })
    ).toBeNull();
  });
});
