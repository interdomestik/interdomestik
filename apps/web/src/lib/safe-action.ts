import type { z } from 'zod';

import { ROLES } from '@interdomestik/shared-auth';
import {
  authenticate,
  failureOfThrown,
  finalize,
  runProtected,
  type Operation,
} from './safe-action.core';
import { denseArray, isOwnReadable, ownValue } from './safe-action.check-def';
import { buildInputGuard } from './safe-action.guard';
import { assertPristineObjectPrototype } from './safe-action.recheck';
import { isActionFailure, type ActionFailure } from './safe-action.failure';
import { recordRefusal, type RefusalActor } from './safe-action.refusal';
import { ActionDefinitionError } from './safe-action.schema';
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

export { actionNormalizers } from './safe-action.normalizers';
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

// shared-auth's role catalogue, read once (R-20: no second role list; R-30: roles come from it).
const ROLE_CATALOGUE: ReadonlySet<unknown> = new Set<unknown>(Object.values(ROLES));
const BASIS_SHAPE = 'basis must be { kind: "role", roles: [...] } or { kind: "self" }';
const SUBJECT_SHAPE = 'subject must be { type, from }, { type: "self" } or { type: "none" }';

type AnyDefinition = ActionDefinition<ActionBasis, z.ZodType, unknown>;

// The basis as a fresh frozen record built from its validated fields, each read once, whatever
// object or realm the caller's basis came from: changing the caller's basis or its roles array
// after definition changes nothing (Astra r6 and r7 B23).
function readBasis(name: string, value: unknown): Exclude<ActionBasis, { kind: 'public' }> {
  if (!isOwnReadable(value)) throw new ActionDefinitionError(name, BASIS_SHAPE);
  const kind = ownValue(value, 'kind');
  if (kind === 'public') throw new ActionDefinitionError(name, PUBLIC_CLOSED);
  if (kind === 'self') return Object.freeze({ kind: 'self' });
  const copy = kind === 'role' ? denseArray(ownValue(value, 'roles'), ROLE_CATALOGUE.size) : null;
  if (!copy?.length || !copy.every(role => typeof role === 'string')) {
    throw new ActionDefinitionError(name, BASIS_SHAPE);
  }
  // A basis names roles of shared-auth's catalogue only, never `user`, `promoter` or any other
  // string (Astra r8 B29, lead finding on B29).
  const stray = copy.find(role => !ROLE_CATALOGUE.has(role));
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
  if (!isOwnReadable(value)) throw new ActionDefinitionError(name, SUBJECT_SHAPE);
  const type = ownValue(value, 'type');
  if (type === 'self' || type === 'none') return Object.freeze({ type });
  const from = ownValue(value, 'from');
  if ((SUBJECT_TYPES as readonly unknown[]).includes(type) && typeof from === 'string') {
    return Object.freeze({ type: type as SubjectType, from });
  }
  throw new ActionDefinitionError(name, SUBJECT_SHAPE);
}

// Reads each field of a definition once, validates what it read and returns a frozen definition
// built from those values only; the action never reads the caller's objects again (B23).
function readDefinition(definition: AnyDefinition, form: boolean) {
  assertPristineObjectPrototype();
  const rawName = ownValue(definition, 'name');
  const name = typeof rawName === 'string' && OPERATION_NAME.test(rawName) ? rawName : null;
  if (!name || name === 'legacy') throw new ActionDefinitionError('<invalid>', 'invalid name');
  const basis = readBasis(name, ownValue(definition, 'basis'));
  const subject = readSubject(name, ownValue(definition, 'subject'));
  const handler = ownValue(definition, 'handler');
  if (typeof handler !== 'function' || !isOwnReadable(handler)) {
    throw new ActionDefinitionError(name, 'handler missing');
  }
  const guard = buildInputGuard(ownValue(definition, 'input'), {
    operation: name,
    basisKind: basis.kind,
    form,
    subjectFrom: 'from' in subject ? [subject.from] : null,
  });
  return Object.freeze({ name, basis, guard, subject, handler });
}

type Protected<S extends z.ZodType, T> = Parameters<typeof runProtected<S, T>>[0];

/** A server action with a declared basis, a strict input schema and one result type (R-05). */
export function defineAction<const B extends ActionBasis, S extends z.ZodType, T>(
  definition: ActionDefinition<B, S, T>
): (input: unknown) => ActionResult<T> {
  const def = readDefinition(definition as unknown as AnyDefinition, false) as Protected<S, T>;
  return input => runProtected(def, input, false);
}

/** The form variant for useActionState and the form action attribute. */
export function defineFormAction<const B extends ActionBasis, S extends z.ZodType, T>(
  definition: ActionDefinition<B, S, T>
): (prevState: unknown, formData: FormData) => ActionResult<T> {
  const def = readDefinition(definition as unknown as AnyDefinition, true) as Protected<S, T>;
  return (_prevState, formData) => runProtected(def, formData, true);
}

const LEGACY: Operation = { name: 'legacy', basis: { kind: 'legacy' }, subject: null, form: false };

function isPassThrough(data: unknown): data is ActionSuccess<unknown> | ActionError {
  return !!data && typeof data === 'object' && ('success' in data || 'error' in data);
}

/**
 * Legacy: build new actions with `defineAction` / `defineFormAction` (R-05). Kept for the unmigrated
 * actions, which CHK-04's baseline records; it shares authentication, the classifier and the refusal
 * record (operation `legacy`, subject unknown) and keeps its duck-typed pass-through of results.
 */
export async function runAuthenticatedAction<T>(
  handler: (ctx: ProtectedActionContext) => Promise<T>
): ActionResult<T> {
  assertPristineObjectPrototype();
  let actor: RefusalActor | null = null;
  let outcome: T | ActionFailure;
  try {
    const auth = await authenticate();
    assertPristineObjectPrototype();
    actor = auth.actor;
    if (auth.kind === 'refused') {
      outcome = auth.failure;
    } else {
      const data = await handler(auth.ctx);
      assertPristineObjectPrototype();
      // A branded failure takes the one finalize path (recorded once, concealment applied).
      if (isActionFailure(data)) {
        outcome = data;
      } else if (isPassThrough(data)) {
        if (data.success !== true && isRefusalCode(data.code)) {
          const refusal = {
            __proto__: null,
            operation: LEGACY.name,
            basis: LEGACY.basis.kind,
            code: data.code,
            subject: { type: 'unknown' },
          } as const;
          await recordRefusal(refusal, actor);
          assertPristineObjectPrototype();
        }
        assertPristineObjectPrototype();
        return data as ActionSuccess<T> | ActionError;
      } else {
        outcome = data;
      }
    }
  } catch (error) {
    outcome = failureOfThrown(error, LEGACY.name);
  }
  const result = await finalize<T>(LEGACY, undefined, outcome, actor);
  assertPristineObjectPrototype();
  return result;
}
