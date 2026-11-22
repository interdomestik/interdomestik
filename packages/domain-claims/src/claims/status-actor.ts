import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

export type ClaimStatusActor =
  | Readonly<{ kind: 'staff'; id: string; branchId: string | null; tenantId: string }>
  | Readonly<{
      kind: 'admin';
      id: string;
      role: 'admin' | 'tenant_admin' | 'super_admin';
      tenantId: string;
    }>;

export function resolveClaimStatusActor(authority: TenantAuthority): ClaimStatusActor | null {
  const { tenantId, purpose, principal } = readTenantAuthority(authority);
  if (!principal) return null;
  const testAuthority =
    purpose === 'test' &&
    (process.env.NODE_ENV === 'test' ||
      Boolean(
        process.env.VITEST || process.env.NODE_TEST_CONTEXT || process.env.TEST_WORKER_INDEX
      ));
  if (purpose !== 'session' && !testAuthority) return null;

  const { userId: id, branchId, role } = principal;
  if (role === 'staff') return Object.freeze({ kind: 'staff', id, branchId, tenantId });
  if (role === 'admin' || role === 'tenant_admin' || role === 'super_admin') {
    return Object.freeze({ kind: 'admin', id, role, tenantId });
  }
  return null;
}
