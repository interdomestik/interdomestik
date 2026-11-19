import { safeExceptionType } from '@/lib/observability/sentry-error-labels';
import * as Sentry from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';

import { defaultFailureMessage } from './safe-action.failure';
import { isRefusalCode, type RefusalCode } from './safe-action.types';

// A thrown error is a refusal only when BOTH its code is a refusal code and its class is one of
// ours. Provider errors (APIError, PostgresError, ...) never are, whatever their code or text, and
// no message text is ever matched (design §4).
const REFUSAL_ERROR_NAMES: ReadonlySet<string> = new Set([
  'UnauthorizedError',
  'MissingTenantError',
  'AuthError',
  'AccessDeniedError',
  'Error',
]);

export type Classified =
  | { kind: 'refusal'; code: RefusalCode; error: string; reason?: 'cross_tenant' }
  | { kind: 'internal' };

type ThrownShape = { name?: unknown; code?: unknown; message?: unknown; reason?: unknown };

function refusalMessage(code: RefusalCode, message: unknown): string {
  if (code === 'MISSING_TENANT') return defaultFailureMessage(code);
  return typeof message === 'string' && message ? message : defaultFailureMessage(code);
}

/**
 * The one classifier of both wrappers. Next control flow (redirect, notFound, forbidden and
 * unauthorized fallbacks, its rendering-control errors, nested causes) is rethrown first.
 */
export function classifyThrown(error: unknown, operation: string): Classified {
  unstable_rethrow(error);
  const thrown: ThrownShape = typeof error === 'object' && error !== null ? error : {};
  if (thrown.message === 'NEXT_REDIRECT') throw error;

  const name = typeof thrown.name === 'string' ? thrown.name : undefined;
  const code =
    name === 'AccessDeniedError' && thrown.code === undefined ? 'UNAUTHORIZED' : thrown.code;
  if (name !== undefined && REFUSAL_ERROR_NAMES.has(name) && isRefusalCode(code)) {
    return {
      kind: 'refusal',
      code,
      error: refusalMessage(code, thrown.message),
      ...(thrown.reason === 'cross_tenant' ? { reason: 'cross_tenant' as const } : {}),
    };
  }

  Sentry.captureException(error);
  console.error('[SafeAction] unexpected failure', {
    operation,
    errorName: safeExceptionType(name),
  });
  return { kind: 'internal' };
}
