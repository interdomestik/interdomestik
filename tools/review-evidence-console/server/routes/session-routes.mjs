import { clearSessionCookie, sessionCookie } from '../auth/cookies.mjs';
import { hasValidMutationOrigin, requestOrigin } from '../auth/origin.mjs';
import { authenticateRequest, publicAccount } from '../auth/session-context.mjs';
import { createSessionToken, sessionExpiryFromToken } from '../auth/session-token.mjs';
import { accountWithDraftScope } from '../auth/draft-scope.mjs';
import { readJsonBody } from '../http/read-body.mjs';
import { emptyResponse, jsonResponse, unauthorizedResponse } from '../http/responses.mjs';

function methodNotAllowed(allow) {
  return jsonResponse(405, { code: 'method_not_allowed' }, { allow });
}

async function login(request, context) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!hasValidMutationOrigin(request)) return jsonResponse(403, { code: 'forbidden' });
  const limit = context.limiter.consume(request);
  if (!limit.allowed) {
    context.events.emit('rate_limited');
    return jsonResponse(429, { code: 'try_again_later' }, { 'retry-after': limit.retryAfter });
  }
  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(body.status, { code: body.code });
  const { username, password } = body.value;
  const verified = await context.verifyCredentials(context.registry, username, password);
  if (!verified.ok) {
    context.events.emit('login_failed');
    return unauthorizedResponse();
  }
  const token = await createSessionToken(verified.account, {
    secret: context.sessionSecret,
    origin: requestOrigin(request),
    now: context.now,
  });
  const scopedAccount = await accountWithDraftScope(verified.account, context.sessionSecret);
  return jsonResponse(200, publicAccount(scopedAccount, sessionExpiryFromToken(token)), {
    'set-cookie': sessionCookie(token),
  });
}

async function probe(request, context) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const session = await authenticateRequest(request, context);
  if (!session.ok) context.events.emit('session_failed');
  return session.ok
    ? jsonResponse(200, publicAccount(session.account, session.expiresAt))
    : unauthorizedResponse();
}

async function logout(request) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!hasValidMutationOrigin(request)) return jsonResponse(403, { code: 'forbidden' });
  return emptyResponse(204, { 'set-cookie': clearSessionCookie() });
}

export function routeSession(request, pathname, context) {
  if (pathname === '/api/session/login') return login(request, context);
  if (pathname === '/api/session/logout') return logout(request);
  if (pathname === '/api/session') return probe(request, context);
  return null;
}
