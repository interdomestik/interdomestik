import { writeAuditEvent } from '@/lib/audit.core';
import { safeExceptionType } from '@/lib/observability/sentry-error-labels';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import * as Sentry from '@sentry/nextjs';

import type { ActionSubject, RecordedSubject, RefusalCode } from './safe-action.types';

// An opaque id: no separators, no control characters, nothing a log line could be split on.
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type RefusalActor = {
  authority: TenantAuthority;
  actorId: string;
  actorRole: string | null;
};

export type Refusal = {
  operation: string;
  basis: string;
  code: RefusalCode;
  subject: RecordedSubject;
  reason?: 'cross_tenant';
};

function readRawValue(rawInput: unknown, from: string, form: boolean): unknown {
  if (form) {
    if (!(rawInput instanceof FormData)) return undefined;
    const values = rawInput.getAll(from);
    return values.length === 1 ? values[0] : undefined;
  }
  if (typeof rawInput !== 'object' || rawInput === null) return undefined;
  return Object.hasOwn(rawInput, from) ? (rawInput as Record<string, unknown>)[from] : undefined;
}

/**
 * The target named by a refusal, read declaratively from the raw input without parsing or running
 * any refinement (design §5.1). A malformed target is `unknown`; the denial itself stands.
 */
export function extractSubject(
  subject: ActionSubject,
  rawInput: unknown,
  options: { form: boolean; actorId: string | null }
): RecordedSubject {
  if (subject.type === 'none') return { type: 'none' };
  if (subject.type === 'self') return { type: 'self', id: options.actorId };
  const value = readRawValue(rawInput, subject.from, options.form);
  return {
    type: subject.type,
    id: typeof value === 'string' && OPAQUE_ID.test(value) ? value : 'unknown',
  };
}

/**
 * Records one refusal (trigger (a) of DIRECTION 6.4). With an authority: one audit row under the
 * caller's own tenant, without request headers. Without one: no database write, one log line that
 * never carries the subject id. A failed write is captured and logged by name only; the refusal
 * result stands either way.
 */
export async function recordRefusal(refusal: Refusal, actor: RefusalActor | null): Promise<void> {
  if (!actor) {
    console.warn('[SafeAction] refused', {
      operation: refusal.operation,
      code: refusal.code,
      basis: refusal.basis,
      subjectType: refusal.subject.type,
    });
    return;
  }
  const outcome = await writeAuditEvent({
    authority: actor.authority,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'action.refused',
    entityType: 'server_action',
    entityId: refusal.operation,
    metadata: {
      code: refusal.code,
      basis: refusal.basis,
      subject: refusal.subject,
      ...(refusal.reason ? { reason: refusal.reason } : {}),
    },
  });
  if (outcome.ok) return;
  Sentry.captureException(outcome.error);
  console.error('[SafeAction] refusal record failed', {
    operation: refusal.operation,
    code: refusal.code,
    errorName: safeExceptionType((outcome.error as { name?: unknown } | null)?.name),
  });
}
