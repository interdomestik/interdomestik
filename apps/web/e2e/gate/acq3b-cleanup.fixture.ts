import {
  account,
  agentSettings,
  and,
  auditLog,
  claims,
  eq,
  inArray,
  memberLeads,
  membershipCards,
  session,
  sponsorHandoverIntents,
  sponsorMailOutbox,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  subscriptions,
  user,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import type { SponsorFixture } from './acq3b-context.fixture';

export async function cleanupSponsorFixture(f: SponsorFixture): Promise<void> {
  await withTenantAuthority(f.authority, async tx => {
    const companies = await tx
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(and(eq(sponsors.tenantId, f.tenantId), inArray(sponsors.sourceLeadId, f.leadIds)));
    const companyIds = companies.map(row => row.id);
    const terms = companyIds.length
      ? await tx
          .select({ id: sponsorTerms.id })
          .from(sponsorTerms)
          .where(inArray(sponsorTerms.sponsorId, companyIds))
      : [];
    const termIds = terms.map(row => row.id);
    const entries = termIds.length
      ? await tx
          .select()
          .from(sponsorRosterEntries)
          .where(inArray(sponsorRosterEntries.termId, termIds))
      : [];
    const entryIds = entries.map(row => row.id);
    const revisions = termIds.length
      ? await tx
          .select({ id: sponsorTermRevisions.id })
          .from(sponsorTermRevisions)
          .where(inArray(sponsorTermRevisions.termId, termIds))
      : [];
    const revisionIds = revisions.map(row => row.id);
    const generated = await tx.select({ id: user.id }).from(user).where(eq(user.email, f.newEmail));
    const people = [
      f.agent.id,
      f.staff.id,
      f.member.id,
      f.paying.id,
      f.other.id,
      ...generated.map(p => p.id),
    ];
    const intents = await tx
      .select({ id: sponsorHandoverIntents.id })
      .from(sponsorHandoverIntents)
      .where(inArray(sponsorHandoverIntents.userId, people));
    const intentIds = intents.map(row => row.id);
    if (entryIds.length)
      await tx.delete(sponsorMailOutbox).where(inArray(sponsorMailOutbox.rosterEntryId, entryIds));
    if (intentIds.length)
      await tx
        .delete(sponsorMailOutbox)
        .where(inArray(sponsorMailOutbox.handoverIntentId, intentIds));
    if (entryIds.length)
      await tx.delete(sponsorRosterEntries).where(inArray(sponsorRosterEntries.id, entryIds));
    if (intentIds.length)
      await tx.delete(sponsorHandoverIntents).where(inArray(sponsorHandoverIntents.id, intentIds));
    if (revisionIds.length)
      await tx
        .delete(sponsorRevisionDecisions)
        .where(inArray(sponsorRevisionDecisions.revisionId, revisionIds));
    if (revisionIds.length)
      await tx.delete(sponsorTermRevisions).where(inArray(sponsorTermRevisions.id, revisionIds));
    if (termIds.length) await tx.delete(sponsorTerms).where(inArray(sponsorTerms.id, termIds));
    if (companyIds.length) await tx.delete(sponsors).where(inArray(sponsors.id, companyIds));
    const entities = [
      ...companyIds,
      ...termIds,
      ...revisionIds,
      ...entryIds,
      ...intentIds,
      ...people,
    ];
    await tx
      .delete(auditLog)
      .where(and(eq(auditLog.tenantId, f.tenantId), inArray(auditLog.entityId, entities)));
    await tx.delete(memberLeads).where(inArray(memberLeads.id, f.leadIds));
    await tx.delete(claims).where(eq(claims.id, `${f.prefix}-private-claim`));
    await tx.delete(agentSettings).where(eq(agentSettings.agentId, f.agent.id));
    await tx.delete(membershipCards).where(inArray(membershipCards.userId, people));
    await tx.delete(subscriptions).where(inArray(subscriptions.userId, people));
    await tx.delete(session).where(inArray(session.userId, people));
    await tx.delete(account).where(inArray(account.userId, people));
    await tx.delete(user).where(inArray(user.id, people));
  });
  await withTenantAuthority(f.foreignAuthority, tx =>
    tx.delete(user).where(eq(user.id, f.foreign.id))
  );
}
