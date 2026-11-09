import 'server-only';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import type { listSponsorStaffTasks } from '@interdomestik/domain-membership-billing/sponsors/staff-tasks';
import { ROLES } from '@interdomestik/shared-auth';

// §3.4: staff and administrators record handover evidence and close handovers.
const HANDOVER_ROLES: ReadonlySet<string> = new Set([
  ROLES.staff,
  ROLES.tenant_admin,
  ROLES.admin,
  ROLES.super_admin,
]);

type StaffContext = {
  authority: TenantAuthority;
  actor: Parameters<typeof listSponsorStaffTasks>[1];
  tenantId: string;
};

export async function authorizeSponsorTasks(): Promise<StaffContext | null> {
  try {
    const authorized = await authorizeSessionTenant();
    if (!authorized) return null;
    const { authority, session } = authorized;
    const descriptor = readTenantAuthority(authority);
    const principal = descriptor.principal;
    if (
      !principal?.role ||
      !HANDOVER_ROLES.has(principal.role) ||
      session.user.role !== principal.role ||
      principal.userId !== session.user.id ||
      (principal.branchId ?? null) !== (session.user.branchId ?? null) ||
      descriptor.tenantId !== descriptor.accessTenantId
    )
      return null;
    return {
      authority,
      tenantId: descriptor.tenantId,
      actor: {
        userId: principal.userId,
        role: principal.role,
        branchId: principal.branchId ?? null,
        agentTier: null,
      },
    };
  } catch {
    return null;
  }
}
