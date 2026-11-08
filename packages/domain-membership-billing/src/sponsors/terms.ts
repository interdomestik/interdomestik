import {
  and,
  desc,
  eq,
  memberLeads,
  membershipPlans,
  sponsorRevisionDecisions,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';

import { canManageSponsor, type SponsorActor } from './access';

export type SponsorResult<T> =
  { ok: true; value: T } | { ok: false; error: 'not_found' | 'forbidden' | 'invalid' | 'conflict' };

const CLOSED_LEAD_STATUSES: ReadonlySet<string> = new Set(['lost', 'disqualified', 'expired']);
const EXCLUSION_VIOLATION = '23P01';

export type RevisionInput = {
  seatCount: number;
  pricePerSeatMinor: number;
  currency: string;
  contractReference: string;
  termsVersion: string;
};

export function isValidRevisionInput(input: RevisionInput): boolean {
  return (
    Number.isInteger(input.seatCount) &&
    input.seatCount >= 1 &&
    input.seatCount <= 500 &&
    Number.isInteger(input.pricePerSeatMinor) &&
    input.pricePerSeatMinor >= 0 &&
    /^[A-Z]{3}$/u.test(input.currency) &&
    input.contractReference.trim() !== '' &&
    input.termsVersion.trim() !== ''
  );
}

/** A sponsor from a company lead that is not lost, disqualified or expired (§3.3). */
export async function createSponsor(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: {
    leadId: string;
    legalName: string;
    registrationNumber: string | null;
    taxNumber: string | null;
    billingContactName: string;
    billingContactEmail: string;
  }
): Promise<SponsorResult<{ sponsorId: string }>> {
  const { tenantId } = readTenantAuthority(authority);
  if (input.legalName.trim() === '' || input.billingContactName.trim() === '') {
    return { ok: false, error: 'invalid' };
  }
  return withTenantAuthority(authority, async tx => {
    const [lead] = await tx
      .select({
        branchId: memberLeads.branchId,
        agentId: memberLeads.agentId,
        kind: memberLeads.leadKind,
        status: memberLeads.status,
      })
      .from(memberLeads)
      .where(and(eq(memberLeads.tenantId, tenantId), eq(memberLeads.id, input.leadId)))
      .for('update');
    if (!lead) return { ok: false, error: 'not_found' };
    if (!canManageSponsor(actor, { ownerAgentId: lead.agentId, branchId: lead.branchId })) {
      return { ok: false, error: 'forbidden' };
    }
    if (lead.kind !== 'company' || CLOSED_LEAD_STATUSES.has(lead.status)) {
      return { ok: false, error: 'invalid' };
    }
    const sponsorId = `spn_${nanoid()}`;
    const inserted = await tx
      .insert(sponsors)
      .values({
        id: sponsorId,
        tenantId,
        branchId: lead.branchId,
        sourceLeadId: input.leadId,
        legalName: input.legalName.trim(),
        registrationNumber: input.registrationNumber,
        taxNumber: input.taxNumber,
        billingContactName: input.billingContactName.trim(),
        billingContactEmail: input.billingContactEmail.trim().toLowerCase(),
        createdBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: sponsors.id });
    return inserted.length > 0
      ? { ok: true, value: { sponsorId } }
      : { ok: false, error: 'conflict' };
  });
}

/** `sponsors FOR UPDATE` first (§3.5); returns the sponsor's scope for the access check. */
async function lockSponsor(tx: TenantTransaction, tenantId: string, sponsorId: string) {
  const [row] = await tx
    .select({ branchId: sponsors.branchId, leadId: sponsors.sourceLeadId })
    .from(sponsors)
    .where(and(eq(sponsors.tenantId, tenantId), eq(sponsors.id, sponsorId)))
    .for('update');
  if (!row) return null;
  const [lead] = await tx
    .select({ agentId: memberLeads.agentId })
    .from(memberLeads)
    .where(and(eq(memberLeads.tenantId, tenantId), eq(memberLeads.id, row.leadId)));
  return { ownerAgentId: lead?.agentId ?? null, branchId: row.branchId };
}

/** A contract year with its first revision; dates, plan and entity are fixed at creation. */
export async function createTerm(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: {
    sponsorId: string;
    termStart: Date;
    termEnd: Date;
    legalEntityId: string;
    planKey: string;
    revision: RevisionInput;
  }
): Promise<SponsorResult<{ termId: string; revisionId: string }>> {
  const { tenantId } = readTenantAuthority(authority);
  if (input.termEnd <= input.termStart || !isValidRevisionInput(input.revision)) {
    return { ok: false, error: 'invalid' };
  }
  try {
    return await withTenantAuthority(authority, async tx => {
      const scope = await lockSponsor(tx, tenantId, input.sponsorId);
      if (!scope) return { ok: false, error: 'not_found' };
      if (!canManageSponsor(actor, scope)) return { ok: false, error: 'forbidden' };
      const [plan] = await tx
        .select({ tier: membershipPlans.tier })
        .from(membershipPlans)
        .where(and(eq(membershipPlans.tenantId, tenantId), eq(membershipPlans.id, input.planKey)));
      if (!plan) return { ok: false, error: 'invalid' };
      const termId = `spt_${nanoid()}`;
      const revisionId = `spr_${nanoid()}`;
      await tx.insert(sponsorTerms).values({
        id: termId,
        tenantId,
        sponsorId: input.sponsorId,
        termStart: input.termStart.toISOString(),
        termEnd: input.termEnd.toISOString(),
        legalEntityId: input.legalEntityId,
        planKey: input.planKey,
        planId: plan.tier,
        createdBy: actor.userId,
      });
      await tx.insert(sponsorTermRevisions).values({
        id: revisionId,
        tenantId,
        termId,
        revision: 1,
        ...input.revision,
        createdBy: actor.userId,
      });
      return { ok: true, value: { termId, revisionId } };
    });
  } catch (error) {
    if ((error as { code?: string }).code === EXCLUSION_VIOLATION) {
      return { ok: false, error: 'conflict' };
    }
    throw error;
  }
}

/** A new revision of an existing term; its seat count is never below the effective one. */
export async function addRevision(
  authority: TenantAuthority,
  actor: SponsorActor,
  input: { termId: string; revision: RevisionInput }
): Promise<SponsorResult<{ revisionId: string }>> {
  const { tenantId } = readTenantAuthority(authority);
  if (!isValidRevisionInput(input.revision)) return { ok: false, error: 'invalid' };
  return withTenantAuthority(authority, async tx => {
    const [term] = await tx
      .select({ sponsorId: sponsorTerms.sponsorId })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, input.termId)));
    if (!term) return { ok: false, error: 'not_found' };
    const scope = await lockSponsor(tx, tenantId, term.sponsorId);
    if (!scope) return { ok: false, error: 'not_found' };
    if (!canManageSponsor(actor, scope)) return { ok: false, error: 'forbidden' };
    await tx
      .select({ id: sponsorTerms.id })
      .from(sponsorTerms)
      .where(and(eq(sponsorTerms.tenantId, tenantId), eq(sponsorTerms.id, input.termId)))
      .for('update');
    const revisions = await tx
      .select({
        revision: sponsorTermRevisions.revision,
        seatCount: sponsorTermRevisions.seatCount,
        decision: sponsorRevisionDecisions.decision,
      })
      .from(sponsorTermRevisions)
      .leftJoin(
        sponsorRevisionDecisions,
        and(
          eq(sponsorRevisionDecisions.tenantId, sponsorTermRevisions.tenantId),
          eq(sponsorRevisionDecisions.revisionId, sponsorTermRevisions.id)
        )
      )
      .where(
        and(
          eq(sponsorTermRevisions.tenantId, tenantId),
          eq(sponsorTermRevisions.termId, input.termId)
        )
      )
      .orderBy(desc(sponsorTermRevisions.revision));
    const latest = revisions[0];
    if (!latest) return { ok: false, error: 'not_found' };
    if (latest.decision === null) return { ok: false, error: 'conflict' };
    const effective = revisions.find(row => row.decision === 'approved');
    if (effective && input.revision.seatCount < effective.seatCount) {
      return { ok: false, error: 'invalid' };
    }
    const revisionId = `spr_${nanoid()}`;
    await tx.insert(sponsorTermRevisions).values({
      id: revisionId,
      tenantId,
      termId: input.termId,
      revision: latest.revision + 1,
      ...input.revision,
      createdBy: actor.userId,
    });
    return { ok: true, value: { revisionId } };
  });
}
