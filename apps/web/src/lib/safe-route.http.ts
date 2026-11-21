import type { z } from 'zod';

import { isKey } from './safe-action.check-def';
import { defaultFailureMessage, type FailureCode } from './safe-action.failure';
import { assertPristineObjectPrototype } from './safe-action.guard';
import type { ActionError, ActionSuccess } from './safe-action.types';
import type { WritingMethod } from './safe-route';

export const ROUTE_STATUS = Object.freeze({
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_NO_BRANCH: 403,
  FORBIDDEN_NO_AGENT: 403,
  FORBIDDEN_SCOPE_MISMATCH: 403,
  MISSING_TENANT: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
} satisfies Record<FailureCode, number>);

const CACHE_HEADERS = { 'Cache-Control': 'no-store' };
const REPLY_BRAND: unique symbol = Symbol('safe-route.reply');
type JsonValue = z.output<ReturnType<typeof z.json>>;
export type RouteReply = { readonly [REPLY_BRAND]: true };
const replies = new WeakMap<RouteReply, { status: 200 | 201 | 204; body: JsonValue | undefined }>();

export function routeReply(status: 200 | 201, body?: JsonValue): RouteReply;
export function routeReply(status: 204): RouteReply;
export function routeReply(status: 200 | 201 | 204, body?: JsonValue): RouteReply {
  assertPristineObjectPrototype();
  if (
    (status !== 200 && status !== 201 && status !== 204) ||
    (status === 204 && body !== undefined)
  ) {
    throw new TypeError('routeReply requires status 200 or 201, or status 204 without a body');
  }
  const reply = Object.freeze({ [REPLY_BRAND]: true as const });
  replies.set(reply, { status, body });
  return reply;
}

export function methodNotAllowed(method: WritingMethod): Response {
  return new Response(null, { status: 405, headers: { ...CACHE_HEADERS, Allow: method } });
}

function failureResponse(result: ActionError, inputFailure: boolean): Response {
  const code = isKey(ROUTE_STATUS, result.code) ? result.code : 'INTERNAL_SERVER_ERROR';
  const headers = new Headers(CACHE_HEADERS);
  if (code === 'RATE_LIMITED' || code === 'SERVICE_UNAVAILABLE') {
    const seconds = result.retryAfter;
    headers.set(
      'Retry-After',
      String(seconds && Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 1)
    );
  }
  const body: ActionError = { success: false, code, error: defaultFailureMessage(code) };
  if (code === 'VALIDATION_ERROR' && inputFailure && result.issues) body.issues = result.issues;
  return Response.json(body, { status: ROUTE_STATUS[code], headers });
}

export function routeResponse<T>(
  result: ActionSuccess<T> | ActionError,
  inputFailure = false
): Response {
  assertPristineObjectPrototype();
  if (!result.success) return failureResponse(result, inputFailure);
  const reply = replies.get(result.data as RouteReply);
  if (!reply) return Response.json(result, { status: 200, headers: CACHE_HEADERS });
  const { status, body } = reply;
  return body === undefined
    ? new Response(null, { status, headers: CACHE_HEADERS })
    : Response.json(body, { status, headers: CACHE_HEADERS });
}
