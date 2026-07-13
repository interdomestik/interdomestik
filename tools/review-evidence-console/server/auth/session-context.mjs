import { readSessionCookie } from './cookies.mjs';
import { requestOrigin } from './origin.mjs';
import { verifySessionToken } from './session-token.mjs';
import { accountWithDraftScope } from './draft-scope.mjs';

export async function authenticateRequest(request, context) {
  const token = readSessionCookie(request.headers.get('cookie'));
  if (!token) return { ok: false, code: 'invalid_session' };
  const verified = await verifySessionToken(token, context.registry, {
    secret: context.sessionSecret,
    origin: requestOrigin(request),
    now: context.now,
  });
  return verified.ok
    ? { ...verified, account: await accountWithDraftScope(verified.account, context.sessionSecret) }
    : verified;
}

export function publicAccount(account, expiresAt) {
  return {
    displayName: account.displayName,
    role: account.role,
    fixtureId: account.fixtureId,
    draftScope: account.draftScope,
    sessionExpiresAt: expiresAt,
  };
}
