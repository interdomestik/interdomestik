import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { ensureAccessTenantId } from '@interdomestik/shared-auth';

type TestSession = {
  user: {
    id: string;
    role?: string | null;
    tenantId?: string | null;
    accessTenantId?: string | null;
  };
};

/** A test authority shaped as authorizeSessionTenant mints it for the session: tenant and access
 * tenant are the session's access tenant, the principal its user and role. */
export function sessionAuthority(session: TestSession): TenantAuthority {
  const tenantId = ensureAccessTenantId(session as never);
  return mintTestTenantAuthority(tenantId, {
    accessTenantId: tenantId,
    role: session.user.role ?? null,
    userId: session.user.id,
  });
}

/** The tenant context an authority opens: its tenant, access tenant and principal role. */
export function tenantContextOf(authority: unknown) {
  const descriptor = readTenantAuthority(authority as TenantAuthority);
  return {
    accessTenantId: descriptor.accessTenantId,
    role: descriptor.principal?.role ?? null,
    tenantId: descriptor.tenantId,
  };
}
