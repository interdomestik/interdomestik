import { getAgentTier } from '@/app/[locale]/(agent)/agent/_layout.core';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  isSponsorStaff,
  type SponsorActor,
} from '@interdomestik/domain-membership-billing/sponsors/access';
import { ROLES } from '@interdomestik/shared-auth';

export type SponsorContext = { authority: TenantAuthority; actor: SponsorActor };
export type SponsorArea = 'agent' | 'admin' | 'staff';

export function mayUseSponsors(actor: SponsorActor): boolean {
  return (
    isSponsorStaff(actor) ||
    (actor.role === ROLES.branch_manager && Boolean(actor.branchId)) ||
    (actor.role === ROLES.agent && actor.agentTier === 'office' && Boolean(actor.branchId))
  );
}

export function mayUseArea(actor: SponsorActor, area: SponsorArea): boolean {
  if (!mayUseSponsors(actor)) return false;
  if (area === 'agent') return actor.role === ROLES.agent;
  if (area === 'staff') return actor.role === ROLES.staff;
  return actor.role !== ROLES.agent && actor.role !== ROLES.staff;
}

export async function sponsorContext(): Promise<SponsorContext | null> {
  const authorized = await authorizeSessionTenant();
  if (!authorized) return null;
  const {
    session: { user },
    authority,
  } = authorized;
  const actor: SponsorActor = {
    userId: user.id,
    role: user.role ?? '',
    branchId: user.branchId ?? null,
    agentTier:
      user.role === ROLES.agent ? await getAgentTier({ agentId: user.id, authority }) : null,
  };
  return mayUseSponsors(actor) ? { authority, actor } : null;
}
