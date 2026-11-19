import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import * as Sentry from '@sentry/nextjs';
import { headers as nextHeaders } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';

import { assertSessionContext, checkBasis } from './safe-action.basis';
import { classifyThrown } from './safe-action.classify';
import {
  actionFailure,
  isActionFailure,
  toActionError,
  type ActionFailure,
} from './safe-action.failure';
import { formDataToInput } from './safe-action.form';
import { assertParsedShape } from './safe-action.output';
import { extractSubject, recordRefusal, type RefusalActor } from './safe-action.refusal';
import { issuesOf } from './safe-action.schema';
import {
  isRefusalCode,
  type ActionBasis,
  type ActionError,
  type ActionSubject,
  type ActionSuccess,
  type ProtectedActionContext,
  type RecordedSubject,
} from './safe-action.types';

type Authenticated =
  | { kind: 'ok'; ctx: ProtectedActionContext; actor: RefusalActor }
  | { kind: 'refused'; failure: ActionFailure; actor: RefusalActor | null };

const SCOPE_CODES = new Set(['FORBIDDEN_NO_BRANCH', 'FORBIDDEN_NO_AGENT']);

/** Authentication and the session invariants, shared by both wrappers (design §1.1). */
export async function authenticate(): Promise<Authenticated> {
  const requestHeaders = await nextHeaders();
  let authorized: Awaited<ReturnType<typeof authorizeSessionTenant>>;
  try {
    authorized = await authorizeSessionTenant(requestHeaders);
  } catch (error) {
    unstable_rethrow(error);
    const thrown = (error ?? {}) as { name?: unknown; code?: unknown };
    // The same rule as the classifier: our class name AND its refusal code, never one alone.
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
    return { kind: 'ok', ctx, actor };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code !== 'string' || !SCOPE_CODES.has(code)) throw error;
    return { kind: 'refused', failure: actionFailure(code, (error as Error).message), actor };
  }
}

export type Operation = {
  name: string;
  basis: ActionBasis | { kind: 'legacy' };
  subject: ActionSubject | null;
  form: boolean;
};

function subjectOf(op: Operation, rawInput: unknown, actor: RefusalActor | null): RecordedSubject {
  if (op.subject === null) return { type: 'unknown' };
  return extractSubject(op.subject, rawInput, { form: op.form, actorId: actor?.actorId ?? null });
}

/** The only place a result is produced and a refusal recorded; called exactly once per call. */
export async function finalize<T>(
  op: Operation,
  rawInput: unknown,
  outcome: T | ActionFailure,
  actor: RefusalActor | null
): Promise<ActionSuccess<T> | ActionError> {
  if (!isActionFailure(outcome)) {
    return outcome === undefined ? { success: true } : { success: true, data: outcome };
  }
  if (isRefusalCode(outcome.code)) {
    const refusal = {
      operation: op.name,
      basis: op.basis.kind,
      code: outcome.code,
      subject: subjectOf(op, rawInput, actor),
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    };
    await recordRefusal(refusal, actor);
  }
  return toActionError(outcome);
}

/** Classifies a throw into the failure it stands for. */
export function failureOfThrown(error: unknown, operation: string): ActionFailure {
  const classified = classifyThrown(error, operation);
  if (classified.kind === 'internal') return actionFailure('INTERNAL_SERVER_ERROR');
  return actionFailure(classified.code, classified.error, {
    ...(classified.reason ? { reason: classified.reason } : {}),
  });
}

export type ProtectedDefinition<S extends z.ZodType, T> = {
  name: string;
  basis: ActionBasis;
  input: S;
  subject: ActionSubject;
  handler: (input: z.output<S>, ctx: ProtectedActionContext) => Promise<T | ActionFailure>;
};

async function afterAuthentication<S extends z.ZodType, T>(
  def: ProtectedDefinition<S, T>,
  ctx: ProtectedActionContext,
  rawInput: unknown,
  form: { arrayKeys: ReadonlySet<string> } | null
): Promise<T | ActionFailure> {
  const basisFailure = checkBasis(def.basis, ctx.session);
  if (basisFailure) return basisFailure;
  const input = form ? formDataToInput(rawInput, form.arrayKeys) : rawInput;
  if (isActionFailure(input)) return input;
  const parsed = await def.input.safeParseAsync(input);
  if (!parsed.success) {
    return actionFailure('VALIDATION_ERROR', undefined, { issues: issuesOf(parsed.error) });
  }
  assertParsedShape(def.input, parsed.data, def.name);
  return def.handler(parsed.data, ctx);
}

/** role / self: authenticate → session invariants → basis → parse → handler → finalize. */
export async function runProtected<S extends z.ZodType, T>(
  def: ProtectedDefinition<S, T>,
  rawInput: unknown,
  form: { arrayKeys: ReadonlySet<string> } | null
): Promise<ActionSuccess<T> | ActionError> {
  const op: Operation = { name: def.name, basis: def.basis, subject: def.subject, form: !!form };
  let actor: RefusalActor | null = null;
  let outcome: T | ActionFailure;
  try {
    const auth = await authenticate();
    actor = auth.actor;
    outcome =
      auth.kind === 'refused'
        ? auth.failure
        : await afterAuthentication(def, auth.ctx, rawInput, form);
  } catch (error) {
    outcome = failureOfThrown(error, def.name);
  }
  return finalize<T>(op, rawInput, outcome, actor);
}
