export type RetryErrorKind =
  | 'transient'
  | 'permanent'
  | 'auth'
  | 'quota'
  | 'validation'
  | 'unknown';

export type ClassifiedRetryError = {
  kind: RetryErrorKind;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
};

const TRANSIENT_CODES = new Set(['40001', '40P01', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']);
const TRANSIENT_STATUS_MIN = 500;
const TRANSIENT_STATUS_MAX = 599;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : String(asRecord(error)?.name ?? '');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = asRecord(error);
  const value = record?.message ?? record?.error ?? record?.details;
  return typeof value === 'string' ? value : String(error || 'Unknown error');
}

function getNestedCause(error: unknown): unknown {
  return asRecord(error)?.cause;
}

function getStatus(error: unknown): number | null {
  const record = asRecord(error);
  const status = record?.status ?? record?.statusCode ?? record?.code;
  const parsed = typeof status === 'number' ? status : Number.parseInt(String(status ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRetryAfterMs(value: unknown): number | undefined {
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

function getRetryAfterMs(error: unknown): number | undefined {
  const record = asRecord(error);
  const headers = asRecord(record?.headers);
  return (
    parseExplicitRetryAfterMs(record?.retryAfterMs) ??
    parseRetryAfterMs(record?.retryAfter ?? headers?.['retry-after'])
  );
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function quotaResult(message: string, retryAfterMs: number | undefined): ClassifiedRetryError {
  const result: ClassifiedRetryError = { kind: 'quota', message, retryable: true };
  if (retryAfterMs !== undefined) {
    result.retryAfterMs = retryAfterMs;
  }
  return result;
}

export function classifyRetryError(error: unknown): ClassifiedRetryError {
  const cause = getNestedCause(error);
  const status = getStatus(error) ?? getStatus(cause);
  const name = `${getErrorName(error)} ${getErrorName(cause)}`.toLowerCase();
  const message = getErrorMessage(error);
  const text = `${name} ${message} ${getErrorMessage(cause)}`.toLowerCase();
  const code = String(asRecord(error)?.code ?? asRecord(cause)?.code ?? '');

  if (
    name.includes('tenantstoragepatherror') ||
    status === 401 ||
    status === 403 ||
    includesAny(text, [/unauthorized/, /forbidden/, /tenant id is required/, /bucket mismatch/])
  ) {
    return { kind: 'auth', message, retryable: false };
  }

  const retryAfterMs = getRetryAfterMs(error) ?? getRetryAfterMs(cause);
  if (status === 429 || retryAfterMs !== undefined || includesAny(text, [/quota/, /rate.?limit/])) {
    return quotaResult(message, retryAfterMs);
  }

  if (
    name.includes('zoderror') ||
    includesAny(text, [/validation/, /schema parse/, /malformed json/, /invalid payload/])
  ) {
    return { kind: 'validation', message, retryable: false };
  }

  if (
    status === 404 ||
    includesAny(text, [
      /was not found/,
      /not found/,
      /missing .*storage path/,
      /unsupported mime/,
      /could not be parsed into text/,
      /duplicate terminal/,
    ])
  ) {
    return { kind: 'permanent', message, retryable: false };
  }

  if (
    (status !== null && status >= TRANSIENT_STATUS_MIN && status <= TRANSIENT_STATUS_MAX) ||
    TRANSIENT_CODES.has(code) ||
    includesAny(text, [
      /fetch failed/,
      /network/,
      /timeout/,
      /abort/,
      /temporar/,
      /deadlock/,
      /serialization/,
      /connection terminated/,
    ])
  ) {
    return { kind: 'transient', message, retryable: true };
  }

  return { kind: 'unknown', message, retryable: false };
}
