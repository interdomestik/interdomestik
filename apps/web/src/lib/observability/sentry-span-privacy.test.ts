import { describe, expect, it } from 'vitest';
import { scrubSentryEvent, scrubSentrySpan } from './sentry-privacy';

describe('span and measurement privacy boundaries', () => {
  it('constructs only supported span fields, retaining technical timings/status while dropping unknown payloads', () => {
    const span = {
      trace_id: 'sdk-trace',
      span_id: 'sdk-span',
      parent_span_id: 'sdk-parent',
      start_timestamp: 123,
      timestamp: 456,
      exclusive_time: 12,
      is_segment: true,
      op: 'http.client',
      status: 'internal_error',
      description: 'private account fact',
      data: {
        'http.status_code': 500,
        'db.statement': 'private query',
        user: { email: 'private' },
      },
      tags: { claim: 'private-claim' },
      extra: { facts: 'private' },
      unknown: 'private',
      links: [{ trace_id: 'private-link', span_id: 'private-span' }],
      origin: 'private-origin',
      measurements: {
        lcp: { value: 12, unit: 'millisecond', extra: 'private' },
        private_claim: { value: 1, unit: 'none' },
      },
    };
    // Deliberately malformed runtime payloads exercise the boundary beyond SDK typing.
    const result = scrubSentrySpan(span as unknown as Parameters<typeof scrubSentrySpan>[0]);
    expect(result).toMatchObject({
      trace_id: 'sdk-trace',
      span_id: 'sdk-span',
      parent_span_id: 'sdk-parent',
      start_timestamp: 123,
      timestamp: 456,
      exclusive_time: 12,
      is_segment: true,
      op: 'http.client',
      status: 'internal_error',
      data: { 'http.status_code': 500 },
      measurements: { lcp: { value: 12, unit: 'millisecond' } },
    });
    expect(JSON.stringify(result)).not.toContain('private');
    for (const key of ['tags', 'extra', 'unknown', 'links', 'origin'])
      expect(result).not.toHaveProperty(key);
  });
  it('drops top-level spans and measurements from non-transaction events', () => {
    const error = {
      message: 'private',
      spans: [
        { trace_id: 'trace', span_id: 'span', start_timestamp: 1, data: { private: 'private' } },
      ],
      measurements: { private: { value: 2, unit: 'private' } },
    };
    const result = scrubSentryEvent(error);
    expect(result).not.toHaveProperty('spans');
    expect(result).not.toHaveProperty('measurements');
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('sanitizes transaction spans and allowlists finite measurements and fixed units', () => {
    const event = {
      type: 'transaction' as const,
      start_timestamp: 1,
      timestamp: 4,
      contexts: { trace: { trace_id: 'trace', span_id: 'span', status: 'ok' } },
      spans: [
        {
          trace_id: 'trace',
          span_id: 'child',
          parent_span_id: 'span',
          start_timestamp: 2,
          timestamp: 3,
          status: 'ok',
          op: 'http.client',
          data: {},
          extra: { secret: 'private' },
        },
      ],
      measurements: {
        fcp: { value: 2, unit: 'millisecond', extra: 'private' },
        cls: { value: 0.2, unit: 'none' },
        lcp: { value: Infinity, unit: 'millisecond' },
        inp: { value: 1, unit: 'private-unit' },
        fid: { value: 'private', unit: 'millisecond' },
        private_claim: { value: 1, unit: 'none' },
      },
    };
    const result = scrubSentryEvent(event as unknown as Parameters<typeof scrubSentryEvent>[0]);
    expect(result).toMatchObject({
      type: 'transaction',
      start_timestamp: 1,
      timestamp: 4,
      contexts: { trace: { status: 'ok' } },
      spans: [{ start_timestamp: 2, timestamp: 3, status: 'ok', op: 'http.client' }],
    });
    expect(result?.measurements).toEqual({
      fcp: { value: 2, unit: 'millisecond' },
      cls: { value: 0.2, unit: 'none' },
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
