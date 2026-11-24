import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { auth } from '@/lib/auth';
import type { AuthorizedSession } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { resolveRequestAdmission } from '@/lib/privacy/require-member-acceptance';
import { resolveDefaultPublicTenantId, type TenantId } from '@/lib/tenant/tenant-hosts';
import {
  resolveSessionTenantConcepts,
  type TenantSessionLike,
} from '@/lib/tenant/tenant-session-context';

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
  | {
      ok: true;
      context: FreeStartDraftSessionContext;
      emailVerified: boolean;
      authorized: AuthorizedSession;
    }
  | {
      ok: false;
      code: 'authRequired' | 'unavailable' | 'unavailableAccountContext' | 'acceptanceRequired';
    };

type FreshSessionArgs = {
  headers: Headers;
  query: { disableCookieCache: true; disableRefresh: true };
};

export type FreeStartDraftSessionDependencies = {
  getSession: (args: FreshSessionArgs) => Promise<unknown>;
  isAllowedHost: (headers: Headers) => boolean;
  resolveDefaultTenantId: () => string | null;
  resolveSessionAccessTenantId: (session: unknown) => string | null;
  admitMember: typeof resolveRequestAdmission;
};

const defaultDependencies: FreeStartDraftSessionDependencies = {
  getSession: args => auth.api.getSession(args),
  // Inside the draft actions' withRequestAdmission scope this is the request's one admission;
  // elsewhere (saved-draft lookups) it resolves these explicit headers as before.
  admitMember: resolveRequestAdmission,
  isAllowedHost: evaluateNeutralOtpHost,
  resolveDefaultTenantId: resolveDefaultPublicTenantId,
  resolveSessionAccessTenantId: session =>
    resolveSessionTenantConcepts(session as TenantSessionLike).accessTenantId,
};

function sessionUser(session: unknown): Record<string, unknown> | null {
  if (!session || typeof session !== 'object') return null;
  const user = (session as { user?: unknown }).user;
  return user && typeof user === 'object' ? (user as Record<string, unknown>) : null;
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function resolveFreeStartDraftSession(
  requestHeaders: Headers,
  dependencies: FreeStartDraftSessionDependencies = defaultDependencies
): Promise<FreeStartDraftSessionResult> {
  if (!dependencies.isAllowedHost(requestHeaders)) {
    return { ok: false, code: 'unavailable' };
  }

  let session: unknown;
  try {
    session = await dependencies.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  } catch {
    return { ok: false, code: 'unavailable' };
  }

  const user = sessionUser(session);
  const ownerUserId = nonBlank(user?.id);
  if (!ownerUserId) return { ok: false, code: 'authRequired' };

  const accessTenantId = nonBlank(dependencies.resolveSessionAccessTenantId(session));
  if (!accessTenantId) return { ok: false, code: 'authRequired' };

  const tenantId = nonBlank(dependencies.resolveDefaultTenantId());
  if (!tenantId || tenantId !== accessTenantId) {
    return { ok: false, code: 'unavailableAccountContext' };
  }

  const admission = await dependencies.admitMember(requestHeaders);
  if (!admission.ok) {
    return {
      ok: false,
      code:
        admission.failure.code === 'acceptance_required' ? 'acceptanceRequired' : 'authRequired',
    };
  }
  const { principal, accessTenantId: admittedTenant } = readTenantAuthority(
    admission.authorized.authority
  );
  if (
    principal?.userId !== ownerUserId ||
    principal.role !== nonBlank(user?.role) ||
    admittedTenant !== accessTenantId
  ) {
    return { ok: false, code: 'authRequired' };
  }

  return {
    ok: true,
    emailVerified: user?.emailVerified === true,
    authorized: admission.authorized,
    context: {
      accessTenantId: accessTenantId as TenantId,
      actorRole: nonBlank(user?.role),
      ownerUserId,
      tenantId: tenantId as TenantId,
    },
  };
}
