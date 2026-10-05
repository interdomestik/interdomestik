import type { Breadcrumb, Event, init } from '@sentry/nextjs';
type Options = NonNullable<Parameters<typeof init>[0]>;
type SpanJSON = Parameters<NonNullable<Options['beforeSendSpan']>>[0];
import { scrubStackFilename, scrubTransactionName, scrubUrl } from './sentry-url-privacy';
import { redactSignedStorageBreadcrumb, redactSignedStorageSpan } from './signed-storage-redaction';

const ACTIONS = new Set(['login_submit', 'saved_draft_submit']);
const OUTCOMES = new Set([
  'success',
  'navigation_started',
  'rejected',
  'unexpected',
  'stale_deployment',
  'cancelled',
  'stalled',
  'slow',
]);
const MESSAGES = new Set([
  'Critical UI action failed',
  'Critical UI action stalled',
  'Critical UI action slow',
]);
const TRACE_STATUSES = new Set([
  'ok',
  'deadline_exceeded',
  'unauthenticated',
  'permission_denied',
  'not_found',
  'resource_exhausted',
  'invalid_argument',
  'unimplemented',
  'unavailable',
  'internal_error',
  'unknown_error',
  'cancelled',
  'already_exists',
  'failed_precondition',
  'aborted',
  'out_of_range',
  'data_loss',
]);
function safeTraceStatus(value: unknown): string | undefined {
  return typeof value === 'string' && TRACE_STATUSES.has(value) ? value : undefined;
}
const SLO_ALERTS = new Set([
  'd07.api.claims.latency',
  'd07.document.download',
  'd07.webhook.processing',
]);
const NUMERIC_KEYS = new Set([
  'duration_ms',
  'sentry.exclusive_time',
  'browser.web_vital.inp.value',
  'status_code',
  'http.status_code',
  'http.response.status_code',
  'http.response_content_length',
  'http.request_content_length',
]);

function safeData(data: Record<string, unknown> = {}): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (NUMERIC_KEYS.has(key) && typeof value === 'number' && Number.isFinite(value))
      result[key] = value;
    if (['url', 'http.url', 'url.full', 'from', 'to'].includes(key) && typeof value === 'string')
      result[key] = scrubUrl(value);
    if (
      key === 'http.route' &&
      typeof value === 'string' &&
      /^\/[^\s]*$/.test(value) &&
      !value.startsWith('//')
    )
      result[key] = scrubUrl(value);
    if (key === 'replayId' && typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value))
      result[key] = value;
    if (key === 'slo_alert' && typeof value === 'string' && SLO_ALERTS.has(value))
      result[key] = value;
    if (key === 'ui_action' && typeof value === 'string' && ACTIONS.has(value)) result[key] = value;
    if (key === 'ui_outcome' && typeof value === 'string' && OUTCOMES.has(value))
      result[key] = value;
  }
  return result;
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    const safe = redactSignedStorageBreadcrumb(breadcrumb);
    if (safe.category === 'console' || safe.category === 'ui.click' || safe.category === 'ui.input')
      return null;
    return {
      timestamp: safe.timestamp,
      level: safe.level,
      type: ['default', 'debug', 'error', 'navigation', 'http', 'info', 'query', 'user'].includes(
        safe.type ?? ''
      )
        ? safe.type
        : 'default',
      category: ['navigation', 'fetch', 'xhr', 'ui.action'].includes(safe.category ?? '')
        ? safe.category
        : 'diagnostic',
      data: safeData(safe.data),
    };
  } catch {
    return null;
  }
}

const MEASUREMENT_NAMES = new Set([
  'fp',
  'fcp',
  'lcp',
  'cls',
  'fid',
  'inp',
  'ttfb',
  'ttfb.requestTime',
]);
const MEASUREMENT_UNITS = new Set([
  '',
  'none',
  'nanosecond',
  'microsecond',
  'millisecond',
  'second',
  'ratio',
  'percent',
]);
function safeMeasurements(measurements: unknown): SpanJSON['measurements'] {
  if (!measurements || typeof measurements !== 'object') return undefined;
  const result: NonNullable<SpanJSON['measurements']> = {};
  for (const [name, measurement] of Object.entries(measurements)) {
    if (!MEASUREMENT_NAMES.has(name) || !measurement || typeof measurement !== 'object') continue;
    const { value, unit } = measurement as { value?: unknown; unit?: unknown };
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      typeof unit !== 'string' ||
      !MEASUREMENT_UNITS.has(unit)
    )
      continue;
    result[name] = { value, unit };
  }
  return result;
}
function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function scrubSentrySpan(span: SpanJSON): SpanJSON {
  // Construct from reviewed SDK fields: no unknown payload can survive a spread.
  const technical: SpanJSON = {
    span_id: span.span_id,
    trace_id: span.trace_id,
    parent_span_id: span.parent_span_id,
    start_timestamp: safeNumber(span.start_timestamp) ?? 0,
    timestamp: safeNumber(span.timestamp),
    exclusive_time: safeNumber(span.exclusive_time),
    is_segment: typeof span.is_segment === 'boolean' ? span.is_segment : undefined,
    description: '[redacted]',
    op: 'diagnostic',
    status: safeTraceStatus(span.status),
    data: {},
  };
  try {
    const safe = redactSignedStorageSpan(span);
    if (['auto.http.browser.inp', 'auto.ui.browser.metrics'].includes(safe.origin ?? ''))
      technical.origin = safe.origin;
    technical.description =
      safe.op === 'ui.action'
        ? 'Critical UI action'
        : safe.is_segment === true
          ? scrubTransactionName(safe.description ?? '')
          : '[redacted]';
    technical.data = safeData(safe.data);
    technical.op = [
      'ui.action',
      'ui.interaction.click',
      'ui.interaction.hover',
      'ui.interaction.drag',
      'ui.interaction.press',
      'ui.long-task',
      'ui.long-animation-frame',
      'http.client',
      'http.server',
      'db',
      'db.query',
      'db.sql.query',
      'pageload',
      'navigation',
      'resource',
      'resource.script',
      'resource.css',
      'resource.img',
      'resource.fetch',
      'resource.xhr',
    ].includes(safe.op ?? '')
      ? safe.op
      : 'diagnostic';
    technical.measurements = safeMeasurements(safe.measurements);
  } catch {
    /* Retain only technical fields if any payload cannot be scrubbed. */
  }
  return technical;
}

export function scrubSentryEvent<T extends Event>(event: T): T | null {
  try {
    const allowedKeys = new Set([
      'event_id',
      'timestamp',
      'start_timestamp',
      'type',
      'platform',
      'level',
      'release',
      'environment',
      'sdk',
      'message',
      'tags',
      'contexts',
      'request',
      'transaction',
      'breadcrumbs',
      'exception',
      'spans',
      'measurements',
    ]);
    const result = Object.fromEntries(
      Object.entries(event).filter(([key]) => allowedKeys.has(key))
    ) as T;
    delete result.user;
    delete result.extra;
    delete result.logentry;
    delete result.server_name;
    delete result.fingerprint;
    result.message = MESSAGES.has(event.message ?? '') ? event.message : undefined;
    result.tags = safeData(event.tags);
    result.contexts = event.contexts?.trace
      ? {
          trace: {
            trace_id: event.contexts.trace.trace_id,
            span_id: event.contexts.trace.span_id,
            parent_span_id: event.contexts.trace.parent_span_id,
            status: safeTraceStatus(event.contexts.trace.status),
          },
        }
      : {};
    result.request = event.request
      ? { url: event.request.url ? scrubUrl(event.request.url) : undefined }
      : undefined;
    result.transaction = event.transaction ? scrubTransactionName(event.transaction) : undefined;
    result.breadcrumbs = event.breadcrumbs
      ?.map(scrubSentryBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
    result.exception = event.exception
      ? {
          values: event.exception.values?.map(exception => ({
            type: 'Error',
            value: 'Application failure',
            mechanism: exception.mechanism
              ? { type: 'generic', handled: exception.mechanism.handled }
              : undefined,
            stacktrace: exception.stacktrace
              ? {
                  ...exception.stacktrace,
                  frames: exception.stacktrace.frames?.map(frame => {
                    const safeFrame = { ...frame };
                    delete safeFrame.vars;
                    if (safeFrame.filename)
                      safeFrame.filename = scrubStackFilename(safeFrame.filename);
                    if (safeFrame.abs_path)
                      safeFrame.abs_path = scrubStackFilename(safeFrame.abs_path);
                    return safeFrame;
                  }),
                }
              : undefined,
          })),
        }
      : undefined;
    if (result.type === 'transaction') {
      result.spans = result.spans?.map(scrubSentrySpan);
      result.measurements = safeMeasurements(result.measurements);
    } else {
      delete result.spans;
      delete result.measurements;
    }
    return result;
  } catch {
    return null;
  }
}
