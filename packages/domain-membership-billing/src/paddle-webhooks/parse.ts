export function coerceDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// RFC 3339 date-time as sent in Paddle's top-level `occurred_at`. Fractions are
// limited to microseconds so Postgres timestamptz stores the exact signed value.
const PADDLE_OCCURRED_AT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/;

/**
 * Returns the exact signed occurrence time used for provider event ordering, or
 * null when it is absent or not a valid RFC 3339 calendar instant.
 */
export function parsePaddleEventOccurredAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = PADDLE_OCCURRED_AT_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const valid =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59;
  return valid ? value : null;
}

export type ParsedPaddleWebhookBody = {
  parsedPayload: Record<string, unknown>;
  eventTypeFromPayload?: string;
  eventIdFromPayload?: string;
  eventTimestampFromPayload: Date | null;
  eventOccurredAtFromPayload: string | null;
};

export function parsePaddleWebhookBody(body: string): ParsedPaddleWebhookBody {
  let parsedPayload: Record<string, unknown> = {};
  try {
    parsedPayload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    // Keep parsedPayload empty; signature verification will fail anyway.
  }

  const eventTypeFromPayload =
    (parsedPayload['event_type'] as string | undefined) ||
    (parsedPayload['eventType'] as string | undefined) ||
    undefined;
  const eventIdFromPayload =
    (parsedPayload['event_id'] as string | undefined) ||
    (parsedPayload['eventId'] as string | undefined) ||
    (parsedPayload['id'] as string | undefined) ||
    undefined;
  const eventTimestampFromPayload =
    coerceDate(parsedPayload['occurred_at']) ||
    coerceDate(parsedPayload['occurredAt']) ||
    coerceDate(parsedPayload['timestamp']);

  return {
    parsedPayload,
    eventTypeFromPayload,
    eventIdFromPayload,
    eventTimestampFromPayload,
    eventOccurredAtFromPayload: parsePaddleEventOccurredAt(parsedPayload['occurred_at']),
  };
}
