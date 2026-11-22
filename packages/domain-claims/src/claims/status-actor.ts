import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureAccessTenantId, type SessionWithTenant } from '@interdomestik/shared-auth';

export type ClaimStatusActor =
  | Readonly<{ kind: 'staff'; id: string; branchId: string | null; tenantId: string }>
  | Readonly<{
      kind: 'admin';
      id: string;
      role: 'admin' | 'tenant_admin' | 'super_admin';
      tenantId: string;
    }>;

function resolveClaimCommandAuthority(authority: TenantAuthority) {
  const { tenantId, accessTenantId, purpose, principal } = readTenantAuthority(authority);
  if (!principal) return null;
  const testAuthority =
    purpose === 'test' &&
    (process.env.NODE_ENV === 'test' ||
      Boolean(
        process.env.VITEST || process.env.NODE_TEST_CONTEXT || process.env.TEST_WORKER_INDEX
      ));
  if (purpose !== 'session' && !testAuthority) return null;
  return { tenantId, accessTenantId, principal };
}

export function resolveBoundClaimPrincipal(
  authority: TenantAuthority | null,
  session: SessionWithTenant
) {
  if (!authority || !session?.user) return null;
  try {
    const bound = resolveClaimCommandAuthority(authority);
    if (!bound) return null;
    const { tenantId, accessTenantId, principal } = bound;
    const { id, role, branchId } = session.user;
    if (
      tenantId !== accessTenantId ||
      accessTenantId !== ensureAccessTenantId(session) ||
      principal.userId !== id ||
      principal.role !== (role || null) ||
      principal.branchId !== (branchId ?? null)
    ) {
      return null;
    }
    return bound;
  } catch {
    return null;
  }
}

export function resolveClaimStatusActor(authority: TenantAuthority): ClaimStatusActor | null {
  const bound = resolveClaimCommandAuthority(authority);
  if (!bound) return null;
  const { tenantId, principal } = bound;
  const { userId: id, branchId, role } = principal;
  if (role === 'staff') return Object.freeze({ kind: 'staff', id, branchId, tenantId });
  if (role === 'admin' || role === 'tenant_admin' || role === 'super_admin') {
    return Object.freeze({ kind: 'admin', id, role, tenantId });
  }
  return null;
}
