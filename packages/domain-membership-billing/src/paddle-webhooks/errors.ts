export class RetryablePaddleWebhookError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RetryablePaddleWebhookError';
  }
}

/**
 * Stored-error prefix of a schema-rejected receipt. Such a receipt failed before any handler
 * effect, so it is never subscription ordering evidence (see subscription-event-order.ts).
 */
export const PADDLE_PAYLOAD_SCHEMA_ERROR_PREFIX = 'Invalid Paddle payload (';

type PaddleSchemaIssue = { readonly path: readonly PropertyKey[]; readonly code: string };

const MAX_REPORTED_SCHEMA_ISSUES = 10;

function describeSchemaIssues(issues: readonly PaddleSchemaIssue[]): string {
  const described = issues
    .slice(0, MAX_REPORTED_SCHEMA_ISSUES)
    .map(issue => `${issue.path.map(String).join('.') || '(root)'} (${issue.code})`);
  const omitted = issues.length - described.length;
  return omitted > 0 ? `${described.join('; ')}; +${omitted} more` : described.join('; ');
}

/**
 * A verified Paddle payload that the local event schema rejects. It must never be recorded as a
 * processed `ok` receipt: it is retryable, so the receipt is stored as a visible `retryable_error`
 * and Paddle's redelivery of the same signed payload is reclaimed once the schema is corrected.
 * The message names only field paths and issue codes, never payload values.
 */
export class PaddleWebhookPayloadSchemaError extends RetryablePaddleWebhookError {
  constructor(entity: string, issues: readonly PaddleSchemaIssue[]) {
    super(`${PADDLE_PAYLOAD_SCHEMA_ERROR_PREFIX}${entity}): ${describeSchemaIssues(issues)}`);
    this.name = 'PaddleWebhookPayloadSchemaError';
  }
}

/**
 * Permanent (non-retryable) provider ordering failure: the signed event cannot be
 * ordered against the subscription aggregate, so it must not mutate state and
 * redelivery of the same signed payload cannot resolve it.
 */
export class PaddleEventOrderingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaddleEventOrderingError';
  }
}

/**
 * Permanent conflict: a provider subscription reference matches more than one subscription (one
 * row's id equals another row's provider reference). Processing must stop; it must never fall back
 * to customData or other evidence as if the subscription were simply absent.
 */
export class PaddleSubscriptionReferenceAmbiguousError extends Error {
  constructor(reference: string) {
    super(`Paddle subscription reference ${reference} matches more than one subscription`);
    this.name = 'PaddleSubscriptionReferenceAmbiguousError';
  }
}

export function isPaddleSubscriptionReferenceAmbiguousError(
  error: unknown
): error is PaddleSubscriptionReferenceAmbiguousError {
  return error instanceof PaddleSubscriptionReferenceAmbiguousError;
}

export function isRetryablePaddleWebhookError(
  error: unknown
): error is RetryablePaddleWebhookError {
  return error instanceof RetryablePaddleWebhookError;
}
