import {
  and,
  eq,
  isNull,
  memberLeads,
  sponsorRosterEntries,
  sponsorRevisionDecisions,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { canManageRoster, type SponsorActor } from './access';
import { writeSponsorAudit } from './audit';
import type { SponsorResult } from './terms';

/** §2: "left the company" is information only; it never ends or blocks a seat. */
export async function markLeftCompany(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: { entryId: string; now: Date }
): Promise<SponsorResult<{ marked: boolean }>> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const [row] = await tx
      .select({
        termId: sponsorTerms.id,
        branchId: sponsors.branchId,
        ownerAgentId: memberLeads.agentId,
      })
      .from(sponsorRosterEntries)
      .innerJoin(
        sponsorTerms,
        and(
          eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
          eq(sponsorTerms.id, sponsorRosterEntries.termId)
        )
      )
      .innerJoin(
        sponsors,
        and(eq(sponsors.tenantId, sponsorTerms.tenantId), eq(sponsors.id, sponsorTerms.sponsorId))
      )
      .leftJoin(
        memberLeads,
        and(eq(memberLeads.tenantId, sponsors.tenantId), eq(memberLeads.id, sponsors.sourceLeadId))
      )
      .where(
        and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, input.entryId))
      );
    if (!row) return { ok: false, error: 'not_found' };
    const [approved] = await tx
      .select({ id: sponsorRevisionDecisions.id })
      .from(sponsorTermRevisions)
      .innerJoin(
        sponsorRevisionDecisions,
        and(
          eq(sponsorRevisionDecisions.tenantId, sponsorTermRevisions.tenantId),
          eq(sponsorRevisionDecisions.revisionId, sponsorTermRevisions.id),
          eq(sponsorRevisionDecisions.decision, 'approved')
        )
      )
      .where(
        and(
          eq(sponsorTermRevisions.tenantId, tenantId),
          eq(sponsorTermRevisions.termId, row.termId)
        )
      )
      .limit(1);
    const scope = { ownerAgentId: row.ownerAgentId, branchId: row.branchId };
    if (!canManageRoster(actor, scope, approved !== undefined)) {
      return { ok: false, error: 'forbidden' };
    }
    const updated = await tx
      .update(sponsorRosterEntries)
      .set({ leftCompanyAt: input.now.toISOString() })
      .where(
        and(
          eq(sponsorRosterEntries.tenantId, tenantId),
          eq(sponsorRosterEntries.id, input.entryId),
          isNull(sponsorRosterEntries.leftCompanyAt)
        )
      )
      .returning({ id: sponsorRosterEntries.id });
    if (updated.length > 0) {
      await writeSponsorAudit(tx, tenantId, [
        {
          action: 'sponsor_roster.left_company',
          entityType: 'sponsor_roster_entry',
          entityId: input.entryId,
          actorId: actor.userId,
          actorRole: actor.role,
          metadata: { at: input.now.toISOString() },
        },
      ]);
    }
    return { ok: true, value: { marked: updated.length > 0 } };
  });
}
