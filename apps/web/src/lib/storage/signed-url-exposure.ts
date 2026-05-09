export const SIGNED_URL_NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0';
export const SIGNED_URL_REFERRER_POLICY = 'no-referrer';

export const SIGNED_URL_RESPONSE_HEADERS = {
  'Cache-Control': SIGNED_URL_NO_STORE_CACHE_CONTROL,
  'Referrer-Policy': SIGNED_URL_REFERRER_POLICY,
} as const;

export const SIGNED_DOWNLOAD_TTL_CAPS_SECONDS = {
  default: 5 * 60,
  documentDownload: 5 * 60,
  voiceNotePreview: 10 * 60,
} as const;

export type SignedDownloadOperation = keyof typeof SIGNED_DOWNLOAD_TTL_CAPS_SECONDS;

export function signedUrlResponseInit(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', SIGNED_URL_NO_STORE_CACHE_CONTROL);
  headers.set('Referrer-Policy', SIGNED_URL_REFERRER_POLICY);

  return {
    ...init,
    headers,
  };
}

export function resolveSignedDownloadTtlSeconds(args: {
  operation?: SignedDownloadOperation;
  requestedSeconds?: number;
}): number {
  const operation = args.operation ?? 'default';
  const cap = SIGNED_DOWNLOAD_TTL_CAPS_SECONDS[operation];
  const requested = args.requestedSeconds ?? cap;

  if (!Number.isSafeInteger(requested) || requested <= 0) {
    throw new RangeError(`Invalid signed download URL TTL: ${String(requested)}`);
  }

  if (requested > cap) {
    throw new RangeError(`Signed download URL TTL ${requested}s exceeds ${operation} cap ${cap}s`);
  }

  return requested;
}

function formatLogMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (
    value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return value.message;
  }

  return String(value ?? 'unknown');
}

export function redactSignedUrlText(value: unknown): string {
  const text = formatLogMessage(value);

  return text.replace(/https?:\/\/[^\s"'<>]*(?:token|signature|signed)[^\s"'<>]*/gi, match => {
    try {
      const parsed = new URL(match);
      return `${parsed.origin}${parsed.pathname}?[signed-url-redacted]`;
    } catch {
      return '[signed-url-redacted]';
    }
  });
}

function readRecordField(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function readRedactedStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = readRecordField(record, key);
  return typeof value === 'string' ? redactSignedUrlText(value) : undefined;
}

function readPrimitiveField(
  record: Record<string, unknown>,
  key: string
): string | number | undefined {
  const value = readRecordField(record, key);
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export type RedactedSignedUrlErrorDetails = {
  message: string;
  name?: string;
  stack?: string;
  code?: string | number;
  status?: string | number;
  statusCode?: string | number;
};

export function redactSignedUrlErrorDetails(value: unknown): RedactedSignedUrlErrorDetails {
  const details: RedactedSignedUrlErrorDetails = {
    message: redactSignedUrlText(value),
  };

  if (value instanceof Error) {
    details.name = value.name;
    if (value.stack) details.stack = redactSignedUrlText(value.stack);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    details.name = readRedactedStringField(record, 'name') ?? details.name;
    details.stack = readRedactedStringField(record, 'stack') ?? details.stack;
    details.code = readPrimitiveField(record, 'code');
    details.status = readPrimitiveField(record, 'status');
    details.statusCode = readPrimitiveField(record, 'statusCode');
  }

  return details;
}
