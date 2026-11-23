import 'server-only';

import { ROLES } from '@interdomestik/shared-auth';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { ACCESSOR, denseArray, isOwnReadable, ownValue } from './safe-action.check-def';
import type { ActionFailure } from './safe-action.failure';
import { assertPristineObjectPrototype, buildInputGuard } from './safe-action.guard';
import { ActionDefinitionError } from './safe-action.schema';
import {
  SUBJECT_TYPES,
  type ActionBasis,
  type ActionSubject,
  type PortalRole,
  type ProtectedActionContext,
  type SubjectType,
} from './safe-action.types';
import { runRoute } from './safe-route.core';

export { routeReply, type RouteReply } from './safe-route.http';

const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const ROLES_BY_NAME: ReadonlySet<unknown> = new Set(Object.values(ROLES));
const PARTS = ['params', 'query', 'body'] as const;
const EMPTY = z.strictObject({});
const OPERATION_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;
const DEFAULT_BODY_BYTES = 65_536;
const MAX_BODY_BYTES = 1_048_576;

export type WritingMethod = (typeof METHODS)[number];
export type RouteBasis = Exclude<ActionBasis, { kind: 'public' }>;
export type RouteParams = Record<string, string | string[]>;
export type RouteParamsInput = RouteParams | Promise<RouteParams> | undefined;
// D135 allows omitted params and explicit undefined under exactOptionalPropertyTypes.
export type RouteContext = { params?: RouteParams | Promise<RouteParams> } | { params: undefined };

export type RouteMethod = {
  (request: NextRequest, context: RouteContext): Promise<Response>;
  // Next's generated webpack check infers the second argument from the last overload.
  (request: NextRequest, context: { params: Promise<RouteParams> }): Promise<Response>;
};

type SubjectSource = 'params' | 'query';
type RouteSubject =
  | Extract<ActionSubject, { type: 'self' | 'none' }>
  | { type: SubjectType; from: `${SubjectSource}.${string}` };

type Schema = z.ZodType | undefined;
type PartOutput<S extends Schema> = S extends z.ZodType ? z.output<S> : z.output<typeof EMPTY>;
type RouteInput<P extends Schema, Q extends Schema, S extends Schema> = {
  params: PartOutput<P>;
  query: PartOutput<Q>;
  body: PartOutput<S>;
};

export type RouteDefinition<P extends Schema, Q extends Schema, S extends Schema, T> = {
  name: string;
  method: WritingMethod;
  basis: RouteBasis;
  subject: RouteSubject;
  params?: P;
  query?: Q;
  body?: S;
  maxBodyBytes?: number;
  rateLimit?: { limit: number; windowSeconds: number };
  handler: (input: RouteInput<P, Q, S>, ctx: ProtectedActionContext) => Promise<T | ActionFailure>;
};

function readBasis(value: unknown, refuse: (detail: string) => never): RouteBasis {
  const kind = ownValue(value, 'kind');
  if (kind === 'self') return Object.freeze({ kind });
  if (kind !== 'role') return refuse('basis must be role or self');
  const roles = denseArray(ownValue(value, 'roles'), ROLES_BY_NAME.size);
  if (!roles?.length || !roles.every(role => ROLES_BY_NAME.has(role))) {
    return refuse('basis.roles must contain roles from the shared-auth catalogue');
  }
  return Object.freeze({ kind, roles: Object.freeze(roles as PortalRole[]) });
}

function readSubject(value: unknown, refuse: (detail: string) => never) {
  const type = ownValue(value, 'type');
  if (type === 'self' || type === 'none') {
    return { subject: Object.freeze({ type }), subjectFrom: null };
  }
  const from = ownValue(value, 'from');
  if (!(SUBJECT_TYPES as readonly unknown[]).includes(type) || typeof from !== 'string') {
    return refuse('subject must declare its type and source');
  }
  const separator = from.indexOf('.');
  const part = from.slice(0, separator);
  if (separator === -1 || (part !== 'params' && part !== 'query')) {
    return refuse('subject.from must name a params or query key');
  }
  const key = from.slice(separator + 1);
  return {
    subject: Object.freeze({ type: type as SubjectType, from: key }),
    subjectFrom: [part, key] as const,
  };
}

function readPart(
  definition: object,
  key: (typeof PARTS)[number],
  refuse: (detail: string) => never
): z.ZodType | undefined {
  const field = Object.getOwnPropertyDescriptor(definition, key);
  if (!field) return undefined;
  if (!Object.hasOwn(field, 'value') || field.value === null || field.value === undefined) {
    return refuse(`${key} must be an own data schema`);
  }
  // The input guard validates the schema in the composed root and reads its shape once.
  return field.value as z.ZodType;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function readLimits(definition: object, refuse: (detail: string) => never) {
  const maxBodyBytes = Object.hasOwn(definition, 'maxBodyBytes')
    ? ownValue(definition, 'maxBodyBytes')
    : DEFAULT_BODY_BYTES;
  if (!positiveInteger(maxBodyBytes) || maxBodyBytes > MAX_BODY_BYTES) {
    return refuse('maxBodyBytes must be an integer from 1 to 1048576');
  }
  if (!Object.hasOwn(definition, 'rateLimit')) return { maxBodyBytes, rateLimit: null };
  const rate = ownValue(definition, 'rateLimit');
  const limit = ownValue(rate, 'limit');
  const windowSeconds = ownValue(rate, 'windowSeconds');
  if (!positiveInteger(limit) || !positiveInteger(windowSeconds)) {
    return refuse('rateLimit must have positive integer limit and windowSeconds');
  }
  return { maxBodyBytes, rateLimit: Object.freeze({ limit, windowSeconds }) };
}

export function defineRoute<
  P extends Schema = undefined,
  Q extends Schema = undefined,
  S extends Schema = undefined,
  T = unknown,
>(definition: RouteDefinition<P, Q, S, T>): RouteMethod {
  assertPristineObjectPrototype();
  const name = ownValue(definition, 'name');
  if (!isOwnReadable(definition) || typeof name !== 'string' || !OPERATION_NAME.test(name)) {
    throw new ActionDefinitionError('<invalid>', 'invalid route name');
  }
  const refuse = (detail: string): never => {
    throw new ActionDefinitionError(name, detail);
  };
  const method = ownValue(definition, 'method');
  if (!(METHODS as readonly unknown[]).includes(method))
    refuse('method must be POST, PUT, PATCH or DELETE');
  const basis = readBasis(ownValue(definition, 'basis'), refuse);
  const { subject, subjectFrom } = readSubject(ownValue(definition, 'subject'), refuse);
  const handler = ownValue(definition, 'handler');
  if (handler === ACCESSOR || typeof handler !== 'function' || !isOwnReadable(handler)) {
    refuse('handler missing');
  }
  const limits = readLimits(definition, refuse);
  const params = readPart(definition, 'params', refuse);
  const query = readPart(definition, 'query', refuse);
  const body = readPart(definition, 'body', refuse);
  const root = z.strictObject({
    params: params ?? EMPTY,
    query: query ?? EMPTY,
    body: body ?? EMPTY,
  });
  const guard = buildInputGuard(root, {
    operation: name,
    basisKind: basis.kind,
    form: false,
    subjectFrom,
    objectParts: PARTS,
  });
  const captured = Object.freeze({
    name,
    method: method as WritingMethod,
    basis,
    subject,
    subjectFrom,
    ...limits,
    hasBody: body !== undefined,
    guard,
    handler: handler as (
      input: RouteInput<P, Q, S>,
      ctx: ProtectedActionContext
    ) => Promise<T | ActionFailure>,
  });
  return (request, context) => runRoute(captured, request, context);
}
