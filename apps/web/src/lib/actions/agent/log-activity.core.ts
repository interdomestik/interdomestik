import { db } from '@interdomestik/database/db';
import { crmActivities, crmLeads } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function logActivityCore(
  agentId: string,
  tenantId: string,
  leadId: string,
  type: string,
  summary: string
) {
  const lead = await db.query.crmLeads.findFirst({
    where: and(
      eq(crmLeads.id, leadId),
      eq(crmLeads.tenantId, tenantId),
      eq(crmLeads.agentId, agentId)
    ),
  });

  if (!lead) {
    return { error: 'Not found' as const };
  }

  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  await db.insert(crmActivities).values({
    id: nanoid(),
    tenantId,
    leadId,
    agentId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as any,
    summary,
    createdAt: new Date(),
  });

  return { success: true as const };
}
