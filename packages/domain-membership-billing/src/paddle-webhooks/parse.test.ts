import { describe, expect, it } from 'vitest';

import { parsePaddleEventOccurredAt, parsePaddleWebhookBody } from './parse';

describe('parsePaddleEventOccurredAt', () => {
  it.each([
    '2026-09-26T10:18:49.621022Z',
    '2026-09-26T10:18:49Z',
    '2026-09-26T12:18:49.6+02:00',
    '2024-02-29T00:00:00.000000-05:30',
  ])('keeps the exact signed RFC 3339 value %s', value => {
    expect(parsePaddleEventOccurredAt(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    1790435582958,
    '',
    '2026-09-26',
    '2026-09-26 10:18:49Z',
    '2026-09-26T10:18:49',
    '2026-09-26T10:18:49.6210221Z',
    '2026-02-30T00:00:00Z',
    '2025-02-29T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-09-26T24:00:00Z',
    '2026-09-26T23:59:60Z',
    '2026-09-26T10:18:49+24:00',
    ' 2026-09-26T10:18:49Z',
  ])('rejects missing or invalid ordering evidence %s', value => {
    expect(parsePaddleEventOccurredAt(value)).toBeNull();
  });
});

describe('parsePaddleWebhookBody ordering evidence', () => {
  it('reads only the signed top-level occurred_at', () => {
    expect(
      parsePaddleWebhookBody(
        JSON.stringify({ event_id: 'evt_1', occurred_at: '2026-09-26T10:18:49.621022Z', data: {} })
      ).eventOccurredAtFromPayload
    ).toBe('2026-09-26T10:18:49.621022Z');
  });

  it('does not fall back to unsigned-order aliases or nested data timestamps', () => {
    const parsed = parsePaddleWebhookBody(
      JSON.stringify({
        occurredAt: '2026-09-26T10:18:49Z',
        timestamp: '2026-09-26T10:18:49Z',
        data: { occurred_at: '2026-09-26T10:18:49Z' },
      })
    );

    expect(parsed.eventOccurredAtFromPayload).toBeNull();
    expect(parsed.eventTimestampFromPayload).toEqual(new Date('2026-09-26T10:18:49Z'));
  });

  it('returns no ordering evidence for an unparsable body', () => {
    expect(parsePaddleWebhookBody('{not json').eventOccurredAtFromPayload).toBeNull();
  });
});
