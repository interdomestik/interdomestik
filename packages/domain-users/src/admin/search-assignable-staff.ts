import { type TenantTransaction } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isSuperAdmin, isTenantAdmin, ROLES } from '@interdomestik/shared-auth';
import { UnauthorizedError } from '@interdomestik/shared-auth/errors';
import { and, asc, eq, gt, ilike, or } from 'drizzle-orm';

const PAGE_SIZE = 25;
export const STAFF_SEARCH_MAX_LENGTH = 120;

export async function searchAssignableStaff(
  tx: TenantTransaction,
  { authority, search, afterId }: { authority: TenantAuthority; search?: string; afterId?: string }
) {
  const { purpose, tenantId, accessTenantId, principal } = readTenantAuthority(authority);
  const role = principal?.role;
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !(isTenantAdmin(role) || isSuperAdmin(role))
  ) {
    throw new UnauthorizedError('Unauthorized');
  }
  if (search && search.length > STAFF_SEARCH_MAX_LENGTH)
    throw new Error('Staff search is too long');

  const escapedSearch = search?.replace(/[\\%_]/g, String.raw`\$&`);
  const pattern = escapedSearch ? `%${escapedSearch}%` : null;
  const rows = await tx
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      withTenant(
        tenantId,
        user.tenantId,
        and(
          eq(user.role, ROLES.staff),
          afterId === undefined ? undefined : gt(user.id, afterId),
          pattern ? or(ilike(user.name, pattern), ilike(user.email, pattern)) : undefined
        )
      )
    )
    .orderBy(asc(user.id))
    .limit(PAGE_SIZE + 1);

  const items = rows.slice(0, PAGE_SIZE);
  return { items, nextCursor: rows.length > PAGE_SIZE ? items.at(-1)!.id : null };
}
