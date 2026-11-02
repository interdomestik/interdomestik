import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { branches, user } from '@interdomestik/database/schema';
import { and, count, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function fetchBranchesSnapshot(authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  const allBranches = await withTenantAuthority(authority, tx =>
    tx.select().from(branches).where(eq(branches.tenantId, tenantId)).limit(5)
  );

  const branchesData = await Promise.all(
    allBranches.map(async b => {
      // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
      const [active] = await withTenantAuthority(authority, tx =>
        tx
          .select({ count: count() })
          .from(user)
          .where(
            and(
              eq(user.branchId, b.id),
              eq(user.role, 'member') // Assuming 'active' implies role classification for now
            )
          )
      );

      // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
      const [total] = await withTenantAuthority(authority, tx =>
        tx.select({ count: count() }).from(user).where(eq(user.branchId, b.id))
      );

      return {
        id: b.id,
        name: b.name,
        city: 'Unknown',
        activeUsers: active?.count ?? 0,
        totalUsers: total?.count ?? 0,
      };
    })
  );

  return branchesData;
}
