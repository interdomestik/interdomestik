import { db } from '@interdomestik/database/db';
import { crmDeals, crmLeads } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

export type AgentLeadDetails = Awaited<ReturnType<typeof db.query.crmLeads.findFirst>>;

export type AgentLeadDealRow = typeof crmDeals.$inferSelect;

export type AgentLeadDetailsResult =
  | { kind: 'ok'; lead: NonNullable<AgentLeadDetails>; deals: AgentLeadDealRow[] }
  | { kind: 'not_found' }
  | { kind: 'redirect'; href: string };

export async function getAgentLeadDetailsCore(args: {
  leadId: string;
  tenantId: string;
  viewerAgentId: string;
}): Promise<AgentLeadDetailsResult> {
  const lead = await db.query.crmLeads.findFirst({
    where: and(
      eq(crmLeads.id, args.leadId),
      eq(crmLeads.tenantId, args.tenantId),
      eq(crmLeads.agentId, args.viewerAgentId)
    ),
  });

  if (!lead) return { kind: 'not_found' };

  const deals = await db
    .select()
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.tenantId, args.tenantId),
        eq(crmDeals.leadId, args.leadId),
        eq(crmDeals.agentId, args.viewerAgentId)
      )
    );

  return { kind: 'ok', lead, deals };
}
