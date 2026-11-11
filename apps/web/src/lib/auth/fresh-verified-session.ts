import 'server-only';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { coerceTenantId, type TenantId } from '@/lib/tenant/tenant-hosts';

export type FreshVerifiedSession = {
  userId: string;
  email: string;
  emailVerified: boolean;
  accessTenantId: TenantId;
  actorRole: string | null;
};

export type FreshVerifiedSessionResult =
  { ok: true; session: FreshVerifiedSession } | { ok: false; code: 'authRequired' };

type FreshSessionArgs = {
  headers: Headers;
  query: { disableCookieCache: true; disableRefresh: true };
};
type SessionReader = (args: FreshSessionArgs) => Promise<unknown>;
const providerReader: SessionReader = args => auth.api.getSession(args);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Fresh provider verification only; never a cookie-cache read or session refresh.
 * Access tenant takes precedence over the compatibility tenant, as in session tenant concepts.
 * Email verification is a separate write-admission verdict; it never grants draft read access.
 */
export async function readFreshVerifiedSession(
  headers: Headers,
  read: SessionReader = providerReader
): Promise<FreshVerifiedSessionResult> {
  const denied = { ok: false, code: 'authRequired' } as const;
  try {
    const raw = await read({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    const user = record(record(raw)?.user);
    if (!user) return denied;
    const userId = nonBlank(user.id);
    const parsedEmail = z.string().trim().email().safeParse(user.email);
    const email = parsedEmail.success ? parsedEmail.data : null;
    // A present malformed explicit access claim must not silently fall back to tenantId.
    const access = user.accessTenantId;
    const tenant = user.tenantId;
    if (access != null && (typeof access !== 'string' || !coerceTenantId(access))) return denied;
    if (tenant != null && (typeof tenant !== 'string' || !coerceTenantId(tenant))) return denied;
    const accessTenantId =
      coerceTenantId(access as string | null | undefined) ??
      coerceTenantId(tenant as string | null | undefined);
    if (!userId || !email || !accessTenantId) return denied;
    return {
      ok: true,
      session: {
        userId,
        email,
        emailVerified: user.emailVerified === true,
        accessTenantId,
        actorRole: nonBlank(user.role),
      },
    };
  } catch {
    return denied;
  }
}
