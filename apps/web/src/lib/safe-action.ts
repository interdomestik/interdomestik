import type { z } from 'zod';

import {
  authenticate,
  failureOfThrown,
  finalize,
  runProtected,
  type Operation,
} from './safe-action.core';
import { type ActionFailure } from './safe-action.failure';
import { recordRefusal, type RefusalActor } from './safe-action.refusal';
import { ActionDefinitionError, arrayFieldKeys, assertAcceptedSchema } from './safe-action.schema';
import {
  isRefusalCode,
  SUBJECT_TYPES,
  type ActionBasis,
  type ActionError,
  type ActionResult,
  type ActionSubject,
  type ActionSuccess,
  type CtxFor,
  type ProtectedActionContext,
} from './safe-action.types';

export { actionFailure, isActionFailure } from './safe-action.failure';
export type { ActionFailure, ActionFailureOptions } from './safe-action.failure';
export { ActionDefinitionError } from './safe-action.schema';
export { REFUSAL_CODES, SUBJECT_TYPES } from './safe-action.types';
export type {
  ActionBasis,
  ActionError,
  ActionResult,
  ActionSubject,
  ActionSuccess,
  CtxFor,
  PortalRole,
  ProtectedActionContext,
  PublicActionContext,
  RefusalCode,
  SubjectType,
} from './safe-action.types';

export type ActionDefinition<B extends ActionBasis, S extends z.ZodType, T> = {
  /** Stable operation id, unique repo-wide; the refusal record names it. */
  name: string;
  basis: B;
  input: S;
  subject: ActionSubject;
  handler: (input: z.output<S>, ctx: CtxFor<B>) => Promise<T | ActionFailure>;
};

const OPERATION_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const PUBLIC_CLOSED =
  'public intake opens with the PR that makes CHK-04 and CHK-26 fail (design §1.3)';

function assertDefinition(def: ActionDefinition<ActionBasis, z.ZodType, unknown>, form: boolean) {
  const name = typeof def.name === 'string' && OPERATION_NAME.test(def.name) ? def.name : null;
  if (!name || name === 'legacy') throw new ActionDefinitionError(String(def.name), 'invalid name');
  const basis = def.basis as { kind?: unknown; roles?: unknown };
  if (basis?.kind === 'public') throw new ActionDefinitionError(name, PUBLIC_CLOSED);
  const rolesValid =
    Array.isArray(basis?.roles) &&
    basis.roles.length > 0 &&
    basis.roles.every(role => typeof role === 'string');
  if (!(basis?.kind === 'self' || (basis?.kind === 'role' && rolesValid))) {
    throw new ActionDefinitionError(
      name,
      'basis must be { kind: "role", roles: [...] } or { kind: "self" }'
    );
  }
  const subject = def.subject as { type?: unknown; from?: unknown };
  const named = (SUBJECT_TYPES as readonly unknown[]).includes(subject?.type);
  if (!(
    subject?.type === 'self' ||
    subject?.type === 'none' ||
    (named && typeof subject.from === 'string')
  )) {
    throw new ActionDefinitionError(
      name,
      'subject must be { type, from }, { type: "self" } or { type: "none" }'
    );
  }
  if (typeof def.handler !== 'function') throw new ActionDefinitionError(name, 'handler missing');
  assertAcceptedSchema(def.input, {
    operation: name,
    basisKind: basis.kind,
    form,
    subjectFrom: typeof subject.from === 'string' ? subject.from : null,
  });
}

type Protected<S extends z.ZodType, T> = Parameters<typeof runProtected<S, T>>[0];

/** A server action with a declared basis, a strict input schema and one result type (R-05). */
export function defineAction<const B extends ActionBasis, S extends z.ZodType, T>(
  def: ActionDefinition<B, S, T>
): (input: unknown) => ActionResult<T> {
  assertDefinition(def as ActionDefinition<ActionBasis, z.ZodType, unknown>, false);
  const protectedDef = def as unknown as Protected<S, T>;
  return async (input: unknown) => runProtected(protectedDef, input, null);
}

/** The form variant: `(prevState, formData)`, for `useActionState` and `<form action>`. */
export function defineFormAction<const B extends ActionBasis, S extends z.ZodType, T>(
  def: ActionDefinition<B, S, T>
): (prevState: unknown, formData: FormData) => ActionResult<T> {
  assertDefinition(def as ActionDefinition<ActionBasis, z.ZodType, unknown>, true);
  const protectedDef = def as unknown as Protected<S, T>;
  const form = { arrayKeys: arrayFieldKeys(def.input) };
  return async (_prevState: unknown, formData: FormData) =>
    runProtected(protectedDef, formData, form);
}

const LEGACY: Operation = { name: 'legacy', basis: { kind: 'legacy' }, subject: null, form: false };

function isPassThrough(data: unknown): data is ActionSuccess<unknown> | ActionError {
  return !!data && typeof data === 'object' && ('success' in data || 'error' in data);
}

/**
 * @deprecated Build new actions with `defineAction` / `defineFormAction` (R-05). Kept for the
 * unmigrated actions; it shares authentication, the classifier and the refusal record (operation
 * `legacy`, subject unknown) and keeps its duck-typed pass-through of handler results.
 */
export async function runAuthenticatedAction<T>(
  handler: (ctx: ProtectedActionContext) => Promise<T>
): ActionResult<T> {
  let actor: RefusalActor | null = null;
  let outcome: T | ActionFailure;
  try {
    const auth = await authenticate();
    actor = auth.actor;
    if (auth.kind === 'refused') {
      outcome = auth.failure;
    } else {
      const data = await handler(auth.ctx);
      if (isPassThrough(data)) {
        if (data.success === false && isRefusalCode(data.code)) {
          const refusal = { operation: 'legacy', basis: 'legacy', code: data.code };
          await recordRefusal({ ...refusal, subject: { type: 'unknown' } }, actor);
        }
        return data as ActionSuccess<T> | ActionError;
      }
      outcome = data;
    }
  } catch (error) {
    outcome = failureOfThrown(error, LEGACY.name);
  }
  return finalize<T>(LEGACY, undefined, outcome, actor);
}
