import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { readFreshVerifiedSession } from '@/lib/auth/fresh-verified-session';
import type { TenantId } from '@/lib/tenant/tenant-hosts';

export type FreeStartDraftSessionContext = {
  accessTenantId: TenantId;
  actorRole: string | null;
  ownerUserId: string;
  tenantId: TenantId;
};

/**
 * `emailVerified` is an additive draft-admission verdict, not an access decision.
 *
 * BetterAuth providers in this workspace omit `requireEmailVerification`, so a valid password
 * session does not by itself prove a verified email. Submit, lookup and read resolution stay
 * unchanged for unverified owners; only account draft create/update consults this verdict.
 */
export type FreeStartDraftSessionResult =
  | { ok: true; context: FreeStartDraftSessionContext; emailVerified: boolean }
  | {
      ok: false;
      code: 'authRequired' | 'unavailable' | 'unavailableAccountContext';
    };

export type FreeStartDraftSessionDependencies = {
  readSession: typeof readFreshVerifiedSession;
  isAllowedHost: (headers: Headers) => boolean;
};

const defaultDependencies: FreeStartDraftSessionDependencies = {
  readSession: readFreshVerifiedSession,
  isAllowedHost: evaluateNeutralOtpHost,
};

export async function resolveFreeStartDraftSession(
  requestHeaders: Headers,
  dependencies: FreeStartDraftSessionDependencies = defaultDependencies
): Promise<FreeStartDraftSessionResult> {
  if (!dependencies.isAllowedHost(requestHeaders)) {
    return { ok: false, code: 'unavailable' };
  }
  const result = await dependencies.readSession(requestHeaders);
  if (!result.ok) return result;
  const { accessTenantId, actorRole, userId, emailVerified } = result.session;
  return {
    ok: true,
    emailVerified,
    context: {
      accessTenantId,
      actorRole,
      ownerUserId: userId,
      tenantId: accessTenantId,
    },
  };
}
