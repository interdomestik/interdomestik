import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { Session } from '@interdomestik/domain-communications/types';
import { homeTenantId, session } from './tenant-context.integration-fixture';

/** The session and the tenant authority the request session would grant this actor. */
export const asActor = (
  id: string,
  role: string,
  tenantId = homeTenantId,
  branchId: string | null = null
): { session: NonNullable<Session>; authority: TenantAuthority } => ({
  session: session(id, role, tenantId, branchId),
  authority: mintTestTenantAuthority(tenantId, { userId: id, role, branchId }),
});
