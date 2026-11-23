import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ROLES } from '@interdomestik/shared-auth';

export const saleRoles = [ROLES.agent, ROLES.staff, ROLES.tenant_admin] as const;
export type SaleActor = { id: string; tenantId?: string | null };

export function sessionPrincipal(authority: TenantAuthority, roles: readonly string[]) {
  try {
    const { purpose, tenantId, accessTenantId, principal } = readTenantAuthority(authority);
    if (
      purpose !== 'session' ||
      tenantId !== accessTenantId ||
      !principal?.role ||
      !roles.includes(principal.role)
    ) {
      return null;
    }
    return { ...principal, role: principal.role, tenantId };
  } catch {
    return null;
  }
}

export type SalePrincipal = NonNullable<ReturnType<typeof sessionPrincipal>>;

export function matchesSaleActor(principal: SalePrincipal, actor: SaleActor) {
  return principal.userId === actor.id && principal.tenantId === actor.tenantId;
}
