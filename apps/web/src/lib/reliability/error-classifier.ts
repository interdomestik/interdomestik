import { retryAfterFrom } from './retry-after';

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

function firstField(record: Record<string, unknown> | null, names: string[]): unknown {
  return names.map(name => record?.[name]).find(value => value !== undefined);
}

function messageFrom(error: unknown, record: Record<string, unknown> | null): string {
  if (error instanceof Error) return error.message;
  const value = firstField(record, ['message', 'error', 'details']);
  return typeof value === 'string' ? value : String(error || 'Unknown error');
}

function statusFrom(record: Record<string, unknown> | null): number | null {
  const status = firstField(record, ['status', 'statusCode', 'code']);
  const parsed = typeof status === 'number' ? status : Number.parseInt(String(status ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function inspectError(error: unknown) {
  const record = asRecord(error);
  return {
    cause: record?.cause,
    code: String(record?.code ?? ''),
    message: messageFrom(error, record),
    name: error instanceof Error ? error.name : String(record?.name ?? ''),
    retryAfterMs: retryAfterFrom(record, asRecord),
    status: statusFrom(record),
  };
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
  const inspected = inspectError(error);
  const inspectedCause = inspectError(inspected.cause);
  const status = inspected.status ?? inspectedCause.status;
  const name = `${inspected.name} ${inspectedCause.name}`.toLowerCase();
  const message = inspected.message;
  const text = `${name} ${message} ${inspectedCause.message}`.toLowerCase();
  const code = inspected.code || inspectedCause.code;

  if (
    name.includes('tenantstoragepatherror') ||
    status === 401 ||
    status === 403 ||
    includesAny(text, [/unauthorized/, /forbidden/, /tenant id is required/, /bucket mismatch/])
  ) {
    return { kind: 'auth', message, retryable: false };
  }

  const retryAfterMs = inspected.retryAfterMs ?? inspectedCause.retryAfterMs;
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
