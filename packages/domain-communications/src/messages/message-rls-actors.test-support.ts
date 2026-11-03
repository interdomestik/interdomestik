import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { Session } from '../types';
import { homeTenantId, session } from './tenant-context.integration-fixture';

/** The session and the tenant authority the request session would grant this actor. */
export const asActor = (
  id: string,
  role: string,
  tenantId = homeTenantId
): { session: NonNullable<Session>; authority: TenantAuthority } => ({
  session: session(id, role, tenantId),
  authority: mintTestTenantAuthority(tenantId, { userId: id, role }),
});
