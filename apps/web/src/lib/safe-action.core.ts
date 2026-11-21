import { writeAuditEvent } from '@/lib/audit.core';
import { safeExceptionType } from '@/lib/observability/sentry-error-labels';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import * as Sentry from '@sentry/nextjs';
import { headers as nextHeaders } from 'next/headers';
import type { z } from 'zod';

import { assertSessionContext, checkBasis } from './safe-action.basis';
import { ACCESSOR, isOwnReadable, ownValue } from './safe-action.check-def';
import { classifyThrown } from './safe-action.classify';
import { actionFailure, toActionError, type ActionFailure } from './safe-action.failure';
import type { InputGuard } from './safe-action.guard';
import {
  assertPristineObjectPrototype,
  checkControlFlow,
  internalDefect,
} from './safe-action.recheck';
import { extractSubject, recordRefusal, type RefusalActor } from './safe-action.refusal';
import {
  isRefusalCode,
  type ActionBasis,
  type ActionError,
  type ActionSubject,
  type ActionSuccess,
  type ProtectedActionContext,
  type RecordedSubject,
  type RefusalCode,
} from './safe-action.types';

type Authenticated =
  | { kind: 'ok'; ctx: ProtectedActionContext; actor: RefusalActor }
  | { kind: 'refused'; failure: ActionFailure; actor: RefusalActor | null };

const SCOPE_CODES = new Set(['FORBIDDEN_NO_BRANCH', 'FORBIDDEN_NO_AGENT']);
const formGetAll = FormData.prototype.getAll;

/** Authentication and the session invariants, shared by both wrappers (design §1.1). */
export async function authenticate(): Promise<Authenticated> {
  const requestHeaders = await nextHeaders();
  assertPristineObjectPrototype();
  let authorized: Awaited<ReturnType<typeof authorizeSessionTenant>>;
  try {
    authorized = await authorizeSessionTenant(requestHeaders);
    assertPristineObjectPrototype();
  } catch (error) {
    if (!checkControlFlow(error)) throw error;
    const thrown = (error ?? {}) as { name?: unknown; code?: unknown };
    if (thrown.name !== 'MissingTenantError' || thrown.code !== 'MISSING_TENANT') throw error;
    return { kind: 'refused', failure: actionFailure('MISSING_TENANT'), actor: null };
  }
  if (!authorized) return { kind: 'refused', failure: actionFailure('UNAUTHORIZED'), actor: null };
  const { session, authority } = authorized;
  const tenantId = readTenantAuthority(authority).tenantId;
  Sentry.setUser({ id: session.user.id, email: session.user.email, username: session.user.name });
  Sentry.setTag('tenantId', tenantId);
  if (session.user.role) Sentry.setTag('userRole', session.user.role);
  if (session.user.branchId) Sentry.setTag('branchId', session.user.branchId);
  const actor: RefusalActor = {
    authority,
    actorId: session.user.id,
    actorRole: session.user.role ?? null,
  };
  try {
    const scope = assertSessionContext(session);
    const ctx = {
      session,
      authority,
      tenantId,
      requestHeaders,
      userRole: session.user.role,
      scope,
    };
    assertPristineObjectPrototype();
    return { kind: 'ok', ctx, actor };
  } catch (error) {
    if (!checkControlFlow(error)) throw error;
    const code = ownValue(error, 'code');
    if (typeof code !== 'string' || !SCOPE_CODES.has(code)) throw error;
    const message = ownValue(error, 'message');
    return {
      kind: 'refused',
      failure: actionFailure(code, typeof message === 'string' ? message : undefined),
      actor,
    };
  }
}

export type Operation = {
  name: string;
  basis: ActionBasis | { kind: 'legacy' };
  subject: ActionSubject | null;
  form: boolean;
};
function subjectOf(
  op: Operation,
  raw: unknown,
  actor: RefusalActor,
  snapshotted: boolean
): RecordedSubject {
  const subject = op.subject;
  if (subject === null) return { type: 'unknown' };
  const input: Record<string, unknown> = Object.create(null);
  if ('from' in subject && isOwnReadable(raw)) {
    try {
      if (op.form && !snapshotted) {
        const values: FormDataEntryValue[] = Reflect.apply(formGetAll, raw, [subject.from]);
        if (values.length === 1) input[subject.from] = values[0];
      } else {
        const value = ownValue(raw, subject.from);
        input[subject.from] =
          op.form && Array.isArray(value) && value.length === 1 ? value[0] : value;
      }
    } catch (error) {
      checkControlFlow(error);
      // A malformed or unbranded FormData receiver has no subject.
      return { type: subject.type, id: 'unknown' };
    }
  }
  return extractSubject(subject, input, { form: false, actorId: actor.actorId });
}

function recordWriteFailure(op: Operation, code: RefusalCode, error: unknown): void {
  Sentry.captureException(error);
  console.error('[SafeAction] refusal record failed', {
    operation: op.name,
    code,
    errorName: safeExceptionType(ownValue(error, 'name')),
  });
}

export async function writeRefusal(
  op: Operation,
  code: RefusalCode,
  subject: RecordedSubject,
  actor: RefusalActor | null,
  reason?: unknown
): Promise<void> {
  if (!actor) {
    await recordRefusal({ operation: op.name, basis: op.basis.kind, code, subject }, null);
    assertPristineObjectPrototype();
    return;
  }
  const metadata = Object.assign(Object.create(null), {
    code,
    basis: op.basis.kind,
    subject: Object.assign(Object.create(null), subject),
  });
  if (reason === 'cross_tenant') metadata.reason = reason;
  const argument = Object.assign(Object.create(null), {
    authority: actor.authority,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'action.refused',
    entityType: 'server_action',
    entityId: op.name,
    metadata,
  });
  let outcome: Awaited<ReturnType<typeof writeAuditEvent>>;
  try {
    assertPristineObjectPrototype();
    outcome = await writeAuditEvent(argument);
    assertPristineObjectPrototype();
  } catch (error) {
    checkControlFlow(error);
    recordWriteFailure(op, code, error);
    return;
  }
  if (!outcome.ok) {
    checkControlFlow(outcome.error);
    recordWriteFailure(op, code, outcome.error);
  }
  assertPristineObjectPrototype();
}

// Read the private brand from a canonical failure so accessors and inherited brands can be rejected.
const failureBrand = Object.getOwnPropertySymbols(actionFailure('INTERNAL_SERVER_ERROR'))[0];

function failureState(outcome: unknown): 'data' | 'failure' | 'defect' {
  if (!outcome || typeof outcome !== 'object') return 'data';
  for (let value: object | null = outcome; value !== null; value = Object.getPrototypeOf(value)) {
    if (!isOwnReadable(value)) return 'defect';
    if (Object.hasOwn(value, failureBrand)) {
      return value === outcome && ownValue(value, failureBrand) === true ? 'failure' : 'defect';
    }
  }
  return 'data';
}
export async function finalize<T>(
  op: Operation,
  raw: unknown,
  outcome: T | ActionFailure,
  actor: RefusalActor | null,
  snapshotted = false
): Promise<ActionSuccess<T> | ActionError> {
  assertPristineObjectPrototype();
  const state = failureState(outcome);
  if (state === 'data') {
    const result: ActionSuccess<T> =
      outcome === undefined ? { success: true } : { success: true, data: outcome as T };
    assertPristineObjectPrototype();
    return result;
  }
  const code = ownValue(outcome, 'code');
  const error = ownValue(outcome, 'error');
  if (state === 'defect' || typeof code !== 'string' || typeof error !== 'string') {
    const result = toActionError(internalDefect(op.name));
    assertPristineObjectPrototype();
    return result;
  }
  const reason = ownValue(outcome, 'reason');
  if (isRefusalCode(code)) {
    const subject = actor
      ? subjectOf(op, raw, actor, snapshotted)
      : ({ type: op.subject?.type ?? 'unknown' } as RecordedSubject);
    assertPristineObjectPrototype();
    await writeRefusal(op, code, subject, actor, reason);
    assertPristineObjectPrototype();
  }
  const options: ActionFailure = Object.assign(Object.create(null), {
    code,
    error,
    [failureBrand]: true,
  });
  for (const key of ['conceal', 'issues', 'retryAfter'] as const) {
    const value = ownValue(outcome, key);
    if (value !== undefined && value !== ACCESSOR) Object.assign(options, { [key]: value });
  }
  const result = toActionError(options);
  assertPristineObjectPrototype();
  return result;
}

export function failureOfThrown(error: unknown, operation: string): ActionFailure {
  if (!checkControlFlow(error)) return internalDefect(operation);
  const classified = classifyThrown(error, operation);
  if (classified.kind === 'internal') return actionFailure('INTERNAL_SERVER_ERROR');
  return actionFailure(classified.code, classified.error, {
    ...(classified.reason ? { reason: classified.reason } : {}),
  });
}

export type ProtectedDefinition<S extends z.ZodType, T> = {
  name: string;
  basis: Exclude<ActionBasis, { kind: 'public' }>;
  guard: InputGuard;
  subject: ActionSubject;
  handler: (input: z.output<S>, ctx: ProtectedActionContext) => Promise<T | ActionFailure>;
};

export async function runProtected<S extends z.ZodType, T>(
  def: ProtectedDefinition<S, T>,
  raw: unknown,
  form: boolean
): Promise<ActionSuccess<T> | ActionError> {
  assertPristineObjectPrototype();
  const op: Operation = { name: def.name, basis: def.basis, subject: def.subject, form };
  let actor: RefusalActor | null = null;
  let outcome: T | ActionFailure;
  let snapshotted = false;
  try {
    const auth = await authenticate();
    assertPristineObjectPrototype();
    actor = auth.actor;
    const failure =
      auth.kind === 'refused' ? auth.failure : checkBasis(def.basis, auth.ctx.session);
    if (auth.kind === 'refused') {
      outcome = auth.failure;
    } else if (failure) {
      outcome = failure;
    } else {
      const guarded = await def.guard.run(raw, form);
      assertPristineObjectPrototype();
      if (guarded.snapshot !== null) {
        raw = guarded.snapshot;
        snapshotted = true;
      }
      switch (guarded.kind) {
        case 'invalid':
          outcome = guarded.failure;
          break;
        case 'thrown':
          throw guarded.error;
        case 'defect':
          outcome = internalDefect(def.name);
          break;
        case 'value':
          assertPristineObjectPrototype();
          outcome = await def.handler(guarded.value as z.output<S>, auth.ctx);
          assertPristineObjectPrototype();
      }
    }
  } catch (error) {
    outcome = failureOfThrown(error, def.name);
  }
  const result = await finalize<T>(op, raw, outcome, actor, snapshotted);
  assertPristineObjectPrototype();
  return result;
}
