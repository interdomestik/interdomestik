import type { Event, EventHint, StackFrame } from '@sentry/nextjs';
import { safeMechanismType, safeNextDigest, safeReactErrorCode } from './sentry-diagnostic-labels';
import { safeExceptionType, safePostgresCode } from './sentry-error-labels';
import { safeBuildStackFilename } from './sentry-stack-privacy';
import { scrubStackFilename } from './sentry-url-privacy';

function safeCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Source maps resolve symbols from artifacts/coordinates; raw symbols and code are private. */
function scrubSentryFrame(frame: StackFrame): StackFrame {
  return {
    filename: frame.filename === undefined ? undefined : scrubStackFilename(frame.filename),
    abs_path: frame.abs_path === undefined ? undefined : scrubStackFilename(frame.abs_path),
    lineno: safeCoordinate(frame.lineno),
    colno: safeCoordinate(frame.colno),
    in_app: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
  };
}

export function scrubSentryException(exception: Event['exception']): Event['exception'] {
  if (!exception) return undefined;
  return {
    values: exception.values?.map(value => ({
      type: safeExceptionType(value.type),
      value: 'Application failure',
      mechanism: value.mechanism
        ? {
            type: safeMechanismType(value.mechanism.type),
            handled:
              typeof value.mechanism.handled === 'boolean' ? value.mechanism.handled : undefined,
          }
        : undefined,
      stacktrace: value.stacktrace
        ? {
            frames: value.stacktrace.frames?.map(scrubSentryFrame),
          }
        : undefined,
    })),
  };
}

function postgresCode(original: unknown): string | undefined {
  if (!original || typeof original !== 'object') return undefined;
  if (!('name' in original) || original.name !== 'PostgresError' || !('code' in original))
    return undefined;
  const { code } = original;
  return safePostgresCode(code);
}

/** Only reviewed exception classes and SQLSTATE are diagnostic labels; ignore incoming custom tags. */
export function applyExceptionClassification(event: Event, hint?: EventHint): void {
  const exception = event.exception?.values?.at(-1);
  if (!exception) return;
  const type = safeExceptionType(exception.type);
  event.tags = { ...event.tags, error_type: type };
  const original = hint?.originalException;
  const code = type === 'PostgresError' ? postgresCode(original) : undefined;
  if (code) {
    event.tags.postgres_code = code;
    event.fingerprint = ['{{ default }}', type, code];
  }
  // Framework control flow and minified React failures group by their public code, not by text.
  const nextDigest = safeNextDigest(original);
  if (nextDigest) {
    event.tags.next_digest = nextDigest;
    event.fingerprint = ['{{ default }}', type, nextDigest];
  }
  const reactError = safeReactErrorCode(original);
  if (reactError) event.tags.react_error = reactError;
}

/** Debug IDs link build artifacts to source maps; no other image metadata is exportable. */
export function scrubSentryDebugMeta(
  meta: Event['debug_meta'],
  exception: Event['exception']
): Event['debug_meta'] {
  const files = new Set(
    exception?.values?.flatMap(
      value => value.stacktrace?.frames?.flatMap(frame => [frame.filename, frame.abs_path]) ?? []
    ) ?? []
  );
  const images: NonNullable<Event['debug_meta']>['images'] = [];
  for (const image of meta?.images ?? []) {
    if (image.type !== 'sourcemap') continue;
    const { code_file: codeFile, debug_id: debugId } = image;
    if (typeof debugId !== 'string' || typeof codeFile !== 'string') continue;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(debugId)) continue;
    const file = safeBuildStackFilename(codeFile);
    if (!file || file.startsWith('node:') || !files.has(file)) continue;
    images.push({ type: 'sourcemap', code_file: file, debug_id: debugId });
  }
  return images.length > 0 ? { images } : undefined;
}
