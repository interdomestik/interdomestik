import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';

import { enforceRateLimit } from './rate-limit';
import { assertSessionContext, checkBasis } from './safe-action.basis';
import { failureOfThrown, finalize } from './safe-action.core';
import { actionFailure, type ActionFailure } from './safe-action.failure';
import { assertPristineObjectPrototype, type InputGuard } from './safe-action.guard';
import { checkControlFlow, internalDefect } from './safe-action.recheck';
import type { RefusalActor } from './safe-action.refusal';
import {
  isRefusalCode,
  type ActionSubject,
  type ProtectedActionContext,
} from './safe-action.types';
import { methodNotAllowed, routeResponse } from './safe-route.http';
import { readBody, readParams, readQuery, readQuerySubject } from './safe-route.input';
import { sessionRouteOrigins } from './safe-route.origins';
import type { RouteBasis, RouteContext, WritingMethod } from './safe-route';

type CapturedRoute<Input> = Readonly<{
  name: string;
  method: WritingMethod;
  basis: RouteBasis;
  subject: ActionSubject;
  subjectFrom: readonly ['params' | 'query', string] | null;
  maxBodyBytes: number;
  rateLimit: Readonly<{ limit: number; windowSeconds: number }> | null;
  hasBody: boolean;
  guard: InputGuard;
  handler: (input: Input, ctx: ProtectedActionContext) => Promise<unknown>;
}>;

const ORIGIN = /^https?:\/\/[^/?#@\s]+$/u;

function sameOrigin(headers: Headers): boolean {
  if (headers.get('Sec-Fetch-Site') !== 'same-origin') return false;
  const origin = headers.get('Origin');
  return origin !== null && ORIGIN.test(origin) && sessionRouteOrigins().has(origin);
}

async function limitRoute(
  route: Pick<CapturedRoute<never>, 'name' | 'basis' | 'subject' | 'rateLimit'>,
  headers: Headers
): Promise<ActionFailure | null> {
  if (!route.rateLimit) return null;
  const limited = await enforceRateLimit({
    ...route.rateLimit,
    name: `route:${route.name}`,
    headers,
    productionSensitive: true,
    contentFreeTelemetry: true,
  });
  assertPristineObjectPrototype();
  if (limited === null) return null;
  if (limited.status !== 429 && limited.status !== 503) {
    return internalDefect(route.name, 'invalid_rate_limit_response');
  }
  const code = limited.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE';
  console.warn('[SafeRoute] limited', {
    operation: route.name,
    code,
    basis: route.basis.kind,
    subjectType: route.subject.type,
  });
  const retryAfter = Number(limited.headers.get('Retry-After'));
  return actionFailure(code, undefined, { retryAfter });
}

function actorOf({
  authority,
  session,
}: NonNullable<Awaited<ReturnType<typeof authorizeSessionTenant>>>): RefusalActor {
  return { authority, actorId: session.user.id, actorRole: session.user.role ?? null };
}

function sessionContext(
  authorized: NonNullable<Awaited<ReturnType<typeof authorizeSessionTenant>>>,
  requestHeaders: Headers
): ProtectedActionContext {
  const { authority, session } = authorized;
  return {
    authority,
    session,
    requestHeaders,
    tenantId: readTenantAuthority(authority).tenantId,
    userRole: session.user.role,
    scope: assertSessionContext(session),
  };
}

async function authorizeRoute<Input>(
  route: CapturedRoute<Input>,
  headers: Headers
): Promise<
  | { ctx: ProtectedActionContext; actor: RefusalActor }
  | { failure: ActionFailure; actor: RefusalActor | null }
> {
  let actor: RefusalActor | null = null;
  try {
    if (!sameOrigin(headers)) return { failure: actionFailure('FORBIDDEN'), actor };
    const limited = await limitRoute(route, headers);
    assertPristineObjectPrototype();
    if (limited) return { failure: limited, actor };
    const authorized = await authorizeSessionTenant(headers);
    assertPristineObjectPrototype();
    if (!authorized) return { failure: actionFailure('UNAUTHORIZED'), actor };
    actor = actorOf(authorized);
    const ctx = sessionContext(authorized, headers);
    const failure = checkBasis(route.basis, ctx.session);
    assertPristineObjectPrototype();
    return failure ? { failure, actor } : { ctx, actor };
  } catch (error) {
    return { failure: failureOfThrown(error, route.name), actor };
  }
}

async function refusalInput(
  source: CapturedRoute<never>['subjectFrom'],
  request: Request,
  context: RouteContext
): Promise<{ part: unknown }> {
  try {
    if (source === null) return { part: undefined };
    if (source[0] === 'query') return { part: readQuerySubject(request, source[1]) };
    const { params } = await readParams(context);
    assertPristineObjectPrototype();
    return { part: params };
  } catch (error) {
    checkControlFlow(error);
    return { part: undefined };
  }
}

async function runAuthorized<Input>(
  route: CapturedRoute<Input>,
  request: Request,
  context: RouteContext,
  ctx: ProtectedActionContext
) {
  let snapshot: unknown = null;
  try {
    const { params } = await readParams(context);
    assertPristineObjectPrototype();
    const query = readQuery(request, route.guard.fieldKind);
    if ('failure' in query) return { outcome: query.failure, snapshot, inputFailure: true };
    const body = await readBody(request, route.hasBody, route.maxBodyBytes);
    assertPristineObjectPrototype();
    if ('failure' in body) return { outcome: body.failure, snapshot, inputFailure: true };
    const guarded = await route.guard.run({ params, query: query.query, body: body.body }, false);
    assertPristineObjectPrototype();
    snapshot = guarded.snapshot;
    switch (guarded.kind) {
      case 'invalid':
        return { outcome: guarded.failure, snapshot, inputFailure: true };
      case 'thrown':
        throw guarded.error;
      case 'defect':
        return { outcome: internalDefect(route.name, guarded.reason ?? 'parsed_shape'), snapshot };
      case 'value': {
        const outcome = await route.handler(guarded.value as Input, ctx);
        assertPristineObjectPrototype();
        return { outcome, snapshot };
      }
    }
  } catch (error) {
    return { outcome: failureOfThrown(error, route.name), snapshot };
  }
}

export async function runRoute<Input>(
  route: CapturedRoute<Input>,
  request: Request,
  context: RouteContext
): Promise<Response> {
  assertPristineObjectPrototype();
  if (request.method !== route.method) return methodNotAllowed(route.method);
  const authorization = await authorizeRoute(route, request.headers);
  assertPristineObjectPrototype();
  const { actor } = authorization;
  const operation = { name: route.name, basis: route.basis, subject: route.subject, form: false };
  if ('failure' in authorization) {
    const { failure } = authorization;
    const raw =
      actor && isRefusalCode(failure.code)
        ? await refusalInput(route.subjectFrom, request, context)
        : undefined;
    assertPristineObjectPrototype();
    const result = await finalize(operation, raw?.part, failure, actor);
    assertPristineObjectPrototype();
    return routeResponse(route.name, result);
  }

  const { outcome, snapshot, inputFailure } = await runAuthorized(
    route,
    request,
    context,
    authorization.ctx
  );
  assertPristineObjectPrototype();
  const part =
    snapshot !== null && route.subjectFrom
      ? (snapshot as Record<string, unknown>)[route.subjectFrom[0]]
      : undefined;
  const result = await finalize(operation, part, outcome, actor, snapshot !== null);
  assertPristineObjectPrototype();
  return routeResponse(route.name, result, inputFailure);
}
