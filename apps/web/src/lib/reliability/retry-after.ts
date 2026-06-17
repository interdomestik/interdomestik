export function parseRetryAfterMs(value: unknown): number | undefined {
  if (typeof value === 'number' && value >= 0) return value * 1000;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;

  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - Date.now());
}

function parseExplicitRetryAfterMs(value: unknown): number | undefined {
  if (typeof value === 'number' && value >= 0) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function retryAfterFrom(
  record: Record<string, unknown> | null,
  asRecord: (value: unknown) => Record<string, unknown> | null
): number | undefined {
  const headers = asRecord(record?.headers);
  return (
    parseExplicitRetryAfterMs(record?.retryAfterMs) ??
    parseRetryAfterMs(record?.retryAfter ?? headers?.['retry-after'])
  );
}
