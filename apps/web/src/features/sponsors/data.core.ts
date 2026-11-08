import { getAgentLeadsCore } from '@/app/[locale]/(agent)/agent/leads/_core';
import { SPONSORED_IMPORT_SETTING } from '@/lib/actions/agent/sponsored-import-access';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ROLES } from '@interdomestik/shared-auth';
import { mayUseSponsors, type SponsorContext } from './context.core';

export type SponsorOption = { id: string; label: string };
export type TermOptions = { plans: SponsorOption[]; entities: SponsorOption[] };

export async function companyLeads(context: SponsorContext): Promise<SponsorOption[]> {
  const { authority, actor } = context;
  if (!mayUseSponsors(actor)) return [];
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const rows =
      actor.role === ROLES.agent && actor.branchId
        ? await getAgentLeadsCore(
            { tenantId, agentId: actor.userId, branchId: actor.branchId },
            { db: tx }
          )
        : await tx.query.memberLeads.findMany({
            where: (leads, { and, eq }) =>
              and(
                eq(leads.tenantId, tenantId),
                actor.role === ROLES.branch_manager
                  ? eq(leads.branchId, actor.branchId ?? '')
                  : undefined
              ),
          });
    return rows
      .filter(
        row =>
          row.leadKind === 'company' && !['lost', 'disqualified', 'expired'].includes(row.status)
      )
      .map(row => ({ id: row.id, label: row.companyName ?? row.id }));
  });
}

export async function termOptions(context: SponsorContext): Promise<TermOptions> {
  const { authority, actor } = context;
  if (!mayUseSponsors(actor)) return { plans: [], entities: [] };
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const plans = await tx.query.membershipPlans.findMany({
      where: (plans, { and, eq }) => and(eq(plans.tenantId, tenantId), eq(plans.isActive, true)),
      columns: { id: true, name: true },
    });
    const entities = await tx.query.legalEntities.findMany({
      where: (entities, { and, eq }) =>
        and(eq(entities.tenantId, tenantId), eq(entities.isActive, true)),
      columns: { id: true, legalName: true },
    });
    return {
      plans: plans.map(row => ({ id: row.id, label: row.name })),
      entities: entities.map(row => ({ id: row.id, label: row.legalName })),
    };
  });
}

export async function sponsorUploadEnabled(context: SponsorContext): Promise<boolean> {
  if (!mayUseSponsors(context.actor)) return false;
  const { tenantId } = readTenantAuthority(context.authority);
  return withTenantAuthority(context.authority, async tx => {
    const setting = await tx.query.tenantSettings.findFirst({
      where: (settings, { and, eq }) =>
        and(
          eq(settings.tenantId, tenantId),
          eq(settings.category, SPONSORED_IMPORT_SETTING.category),
          eq(settings.key, SPONSORED_IMPORT_SETTING.key)
        ),
      columns: { value: true },
    });
    return setting?.value?.enabled === true;
  });
}
