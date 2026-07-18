import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { auth } from '@/lib/auth';
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

export type FreeStartDraftSessionResult =
  | { ok: true; context: FreeStartDraftSessionContext }
  | {
      ok: false;
      code: 'authRequired' | 'unavailable' | 'unavailableAccountContext';
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
};

const defaultDependencies: FreeStartDraftSessionDependencies = {
  getSession: args => auth.api.getSession(args),
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
    return { ok: false, code: 'authRequired' };
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

  return {
    ok: true,
    context: {
      accessTenantId: accessTenantId as TenantId,
      actorRole: nonBlank(user?.role),
      ownerUserId,
      tenantId: tenantId as TenantId,
    },
  };
}
