import { isRefusalCode, type ActionError } from './safe-action.types';

// A failure is recognised by this module-private brand, never by its shape: a plain object with
// `success: false` returned by a handler is data (DUP-02), not a failure.
const FAILURE_BRAND: unique symbol = Symbol('safe-action.failure');

export type ActionFailureOptions = {
  issues?: Record<string, string>;
  /** Record the refusal under its own code but answer as NOT_FOUND (no existence oracle). */
  conceal?: 'NOT_FOUND';
  /** Set only by trusted policy code, never from a lookup of the foreign row. */
  reason?: 'cross_tenant';
  retryAfter?: number;
};

export type ActionFailure = Readonly<{
  [FAILURE_BRAND]: true;
  code: string;
  error: string;
  issues?: Record<string, string>;
  conceal?: 'NOT_FOUND';
  reason?: 'cross_tenant';
  retryAfter?: number;
}>;

const DEFAULT_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  UNAUTHORIZED: 'Unauthorized',
  MISSING_TENANT: 'Missing tenant context',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  VALIDATION_ERROR: 'Invalid input',
  RATE_LIMITED: 'Too many requests',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  INTERNAL_SERVER_ERROR: 'Internal Server Error',
});

export function defaultFailureMessage(code: string): string {
  return DEFAULT_MESSAGES[code] ?? 'Request failed';
}

export function actionFailure(
  code: string,
  error?: string,
  options: ActionFailureOptions = {}
): ActionFailure {
  if (options.conceal && !isRefusalCode(code)) {
    throw new TypeError(`actionFailure: conceal is only allowed for a refusal code, got ${code}`);
  }
  return Object.freeze({
    [FAILURE_BRAND]: true as const,
    code,
    error: error ?? defaultFailureMessage(code),
    ...(options.issues ? { issues: options.issues } : {}),
    ...(options.conceal ? { conceal: options.conceal } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.retryAfter === undefined ? {} : { retryAfter: options.retryAfter }),
  });
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[FAILURE_BRAND] === true
  );
}

/** The answer the caller sees; a concealed refusal answers as NOT_FOUND. */
export function toActionError(failure: ActionFailure): ActionError {
  if (failure.conceal === 'NOT_FOUND') {
    return { success: false, error: defaultFailureMessage('NOT_FOUND'), code: 'NOT_FOUND' };
  }
  return {
    success: false,
    error: failure.error,
    code: failure.code,
    ...(failure.issues ? { issues: failure.issues } : {}),
    ...(failure.retryAfter === undefined ? {} : { retryAfter: failure.retryAfter }),
  };
}
