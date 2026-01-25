import { db } from '@interdomestik/database/db';
import { memberLeads } from '@interdomestik/database/schema';
import { and, count, eq, isNotNull, lte } from 'drizzle-orm';

export async function getMyFollowUpsCount({
  tenantId,
  agentId,
  now = new Date(),
}: {
  tenantId: string;
  agentId: string;
  now?: Date;
}) {
  const [result] = await db
    .select({ count: count() })
    .from(memberLeads)
    .where(
      and(
        eq(memberLeads.tenantId, tenantId),
        eq(memberLeads.agentId, agentId),
        isNotNull(memberLeads.nextStepAt),
        lte(memberLeads.nextStepAt, now)
      )
    );

  return result?.count ?? 0;
}
