export function coerceDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ParsedPaddleWebhookBody = {
  parsedPayload: Record<string, unknown>;
  eventTypeFromPayload?: string;
  eventIdFromPayload?: string;
  eventTimestampFromPayload: Date | null;
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
  };
}
