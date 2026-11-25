import { claimCorrespondence, desc, eq, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { sql } from 'drizzle-orm';

/** The branch summary: the total and the latest dates only (bounded read). */
export const SUMMARY_DATE_LIMIT = 50;

export async function readSummary(tx: TenantTransaction, tenantId: string, claimId: string) {
  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(claimCorrespondence)
    .where(
      withTenant(tenantId, claimCorrespondence.tenantId, eq(claimCorrespondence.claimId, claimId))
    );
  const rows = await tx
    .select({ occurredAt: claimCorrespondence.occurredAt })
    .from(claimCorrespondence)
    .where(
      withTenant(tenantId, claimCorrespondence.tenantId, eq(claimCorrespondence.claimId, claimId))
    )
    .orderBy(desc(claimCorrespondence.occurredAt))
    .limit(SUMMARY_DATE_LIMIT);
  return { summary: { total, dates: rows.map(row => row.occurredAt.toISOString()) } };
}
