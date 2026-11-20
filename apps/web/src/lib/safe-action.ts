import type { z } from 'zod';

import { PORTAL_ROLES } from './roles.core';
import {
  authenticate,
  failureOfThrown,
  finalize,
  runProtected,
  type Operation,
} from './safe-action.core';
import { isActionFailure, type ActionFailure } from './safe-action.failure';
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
  type PortalRole,
  type ProtectedActionContext,
  type SubjectType,
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

const BASIS_SHAPE = 'basis must be { kind: "role", roles: [...] } or { kind: "self" }';
const SUBJECT_SHAPE = 'subject must be { type, from }, { type: "self" } or { type: "none" }';

type AnyDefinition = ActionDefinition<ActionBasis, z.ZodType, unknown>;

// The basis as a fresh frozen record built from its validated fields, each read once, whatever
// object or realm the caller's basis came from: changing the caller's basis or its roles array
// after definition changes nothing (Astra r6 and r7 B23).
function readBasis(name: string, value: unknown): ActionBasis {
  const { kind, roles } = (value ?? {}) as { kind?: unknown; roles?: unknown };
  if (kind === 'public') throw new ActionDefinitionError(name, PUBLIC_CLOSED);
  if (kind === 'self') return Object.freeze({ kind: 'self' });
  const copy: unknown[] = kind === 'role' && Array.isArray(roles) ? Array.from(roles) : [];
  if (copy.length === 0 || !copy.every(role => typeof role === 'string')) {
    throw new ActionDefinitionError(name, BASIS_SHAPE);
  }
  // A basis names catalogue roles only, never `user` or any other string (Astra r8 B29).
  const stray = copy.find(role => !(PORTAL_ROLES as readonly unknown[]).includes(role));
  if (stray !== undefined) {
    throw new ActionDefinitionError(
      name,
      `basis role "${String(stray)}" is not in the role catalogue`
    );
  }
  return Object.freeze({ kind: 'role', roles: Object.freeze(copy as PortalRole[]) });
}

// The subject as a fresh frozen record built from its validated fields, each read once.
function readSubject(name: string, value: unknown): ActionSubject {
  const { type, from } = (value ?? {}) as { type?: unknown; from?: unknown };
  if (type === 'self' || type === 'none') return Object.freeze({ type });
  if ((SUBJECT_TYPES as readonly unknown[]).includes(type) && typeof from === 'string') {
    return Object.freeze({ type: type as SubjectType, from });
  }
  throw new ActionDefinitionError(name, SUBJECT_SHAPE);
}

// Reads each field of a definition once, validates what it read and returns a frozen definition
// built from those values only; the action never reads the caller's objects again (B23).
function readDefinition(definition: AnyDefinition, form: boolean): AnyDefinition {
  const { name: rawName, basis: rawBasis, input, subject: rawSubject, handler } = definition;
  const name = typeof rawName === 'string' && OPERATION_NAME.test(rawName) ? rawName : null;
  if (!name || name === 'legacy') throw new ActionDefinitionError(String(rawName), 'invalid name');
  const basis = readBasis(name, rawBasis);
  const subject = readSubject(name, rawSubject);
  if (typeof handler !== 'function') throw new ActionDefinitionError(name, 'handler missing');
  assertAcceptedSchema(input, {
    operation: name,
    basisKind: basis.kind,
    form,
    subjectFrom: 'from' in subject ? subject.from : null,
  });
  return Object.freeze({ name, basis, input, subject, handler });
}

type Protected<S extends z.ZodType, T> = Parameters<typeof runProtected<S, T>>[0];

/** A server action with a declared basis, a strict input schema and one result type (R-05). */
export function defineAction<const B extends ActionBasis, S extends z.ZodType, T>(
  definition: ActionDefinition<B, S, T>
): (input: unknown) => ActionResult<T> {
  const def = readDefinition(definition as unknown as AnyDefinition, false);
  const protectedDef = def as unknown as Protected<S, T>;
  return async (input: unknown) => runProtected(protectedDef, input, null);
}

/** The form variant: `(prevState, formData)`, for `useActionState` and `<form action>`. */
export function defineFormAction<const B extends ActionBasis, S extends z.ZodType, T>(
  definition: ActionDefinition<B, S, T>
): (prevState: unknown, formData: FormData) => ActionResult<T> {
  const def = readDefinition(definition as unknown as AnyDefinition, true);
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
      // A branded failure takes the one finalize path (recorded once, concealment applied).
      if (isActionFailure(data)) {
        outcome = data;
      } else if (isPassThrough(data)) {
        if (data.success !== true && isRefusalCode(data.code)) {
          const refusal = { operation: 'legacy', basis: 'legacy', code: data.code };
          await recordRefusal({ ...refusal, subject: { type: 'unknown' } }, actor);
        }
        return data as ActionSuccess<T> | ActionError;
      } else {
        outcome = data;
      }
    }
  } catch (error) {
    outcome = failureOfThrown(error, LEGACY.name);
  }
  return finalize<T>(LEGACY, undefined, outcome, actor);
}
