import { writeAuditEvent } from '@/lib/audit.core';
import { safeExceptionType } from '@/lib/observability/sentry-error-labels';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import * as Sentry from '@sentry/nextjs';

import { ownValue } from './safe-action.check-def';
import { assertPristineObjectPrototype, checkControlFlow } from './safe-action.recheck';
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
  // An own data property only: reading an accessor would run caller-supplied code.
  const descriptor = Object.getOwnPropertyDescriptor(rawInput, from);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
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
  let value: unknown;
  try {
    value = readRawValue(rawInput, subject.from, options.form);
  } catch {
    value = undefined; // a proxy or form object that throws on reading: the target is unknown
  }
  return {
    type: subject.type,
    id: typeof value === 'string' && OPAQUE_ID.test(value) ? value : 'unknown',
  };
}

function recordWriteFailure(refusal: Refusal, error: unknown): void {
  checkControlFlow(error);
  Sentry.captureException(error);
  console.error('[SafeAction] refusal record failed', {
    operation: refusal.operation,
    code: refusal.code,
    errorName: safeExceptionType(ownValue(error, 'name')),
  });
}

/**
 * Records one refusal (trigger (a) of DIRECTION 6.4). With an authority: one audit row under the
 * caller's own tenant, without request headers. Without one: no database write, one log line that
 * never carries the subject id. A failed write is captured and logged by name only; the refusal
 * result stands either way.
 */
export async function recordRefusal(refusal: Refusal, actor: RefusalActor | null): Promise<void> {
  assertPristineObjectPrototype();
  if (!actor) {
    console.warn('[SafeAction] refused', {
      operation: refusal.operation,
      code: refusal.code,
      basis: refusal.basis,
      subjectType: refusal.subject.type,
    });
    assertPristineObjectPrototype();
    return;
  }
  const reason = ownValue(refusal, 'reason');
  const metadata = {
    __proto__: null,
    code: refusal.code,
    basis: refusal.basis,
    subject: { __proto__: null, ...refusal.subject },
    ...(reason === 'cross_tenant' ? { reason } : {}),
  };
  const argument = {
    __proto__: null,
    authority: actor.authority,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'action.refused',
    entityType: 'server_action',
    entityId: refusal.operation,
    metadata,
  };
  let outcome: Awaited<ReturnType<typeof writeAuditEvent>>;
  try {
    assertPristineObjectPrototype();
    outcome = await writeAuditEvent(argument);
    assertPristineObjectPrototype();
  } catch (error) {
    recordWriteFailure(refusal, error);
    return;
  }
  if (!outcome.ok) recordWriteFailure(refusal, outcome.error);
  assertPristineObjectPrototype();
}
