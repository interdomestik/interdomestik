import { db } from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import { eq, sql } from 'drizzle-orm';

export async function fetchClaimsPipeline(tenantId: string) {
  // Using conditional counting to aggregate statuses in one query
  const [pipeline] = await db
    .select({
      unassigned: sql<number>`count(*) filter (where ${claims.status} = 'draft')`,
      inProgress: sql<number>`count(*) filter (where ${claims.status} in ('verification', 'evaluation', 'negotiation', 'court'))`,
      review: sql<number>`count(*) filter (where ${claims.status} = 'submitted')`,
      approved: sql<number>`count(*) filter (where ${claims.status} = 'resolved')`,
      rejected: sql<number>`count(*) filter (where ${claims.status} = 'rejected')`,
    })
    .from(claims)
    .where(eq(claims.tenantId, tenantId));

  return {
    unassigned: Number(pipeline?.unassigned ?? 0),
    inProgress: Number(pipeline?.inProgress ?? 0),
    review: Number(pipeline?.review ?? 0),
    approved: Number(pipeline?.approved ?? 0),
    rejected: Number(pipeline?.rejected ?? 0),
  };
}
