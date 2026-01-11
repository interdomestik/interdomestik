import { db } from '@interdomestik/database';
import { branches, user } from '@interdomestik/database/schema';
import { and, count, eq } from 'drizzle-orm';

export async function fetchBranchesSnapshot(tenantId: string) {
  const allBranches = await db
    .select()
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .limit(5);

  const branchesData = await Promise.all(
    allBranches.map(async b => {
      const [active] = await db
        .select({ count: count() })
        .from(user)
        .where(
          and(
            eq(user.branchId, b.id),
            eq(user.role, 'member') // Assuming 'active' implies role classification for now
          )
        );

      const [total] = await db.select({ count: count() }).from(user).where(eq(user.branchId, b.id));

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
