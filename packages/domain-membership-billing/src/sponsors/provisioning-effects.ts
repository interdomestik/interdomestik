import {
  and,
  eq,
  isNull,
  sponsorMailOutbox,
  sponsorRosterEntries,
  subscriptions,
  type TenantTransaction,
} from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { GROUP_SPONSOR_PROVIDER } from '../sponsor-coverage/evaluate';
import type { ProvisioningEntryFacts } from './provisioning-facts';

/** ACQ-3b §3.7 provisioning writes, applied inside the person transaction (§3.5 locks held). */
const entryWhere = (tenantId: string, entryId: string) =>
  and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entryId));

export async function setStart(tx: TenantTransaction, tenantId: string, entryId: string, at: Date) {
  await tx
    .update(sponsorRosterEntries)
    .set({ startsAt: at.toISOString() })
    .where(and(entryWhere(tenantId, entryId), isNull(sponsorRosterEntries.startsAt)));
}

export async function mark(
  tx: TenantTransaction,
  tenantId: string,
  entryId: string,
  outcome: 'foreign' | 'not_eligible' | 'awaiting_paid_end'
) {
  await tx
    .update(sponsorRosterEntries)
    .set({ outcome, reviewReason: null })
    .where(entryWhere(tenantId, entryId));
}

export async function review(
  tx: TenantTransaction,
  tenantId: string,
  entryId: string,
  reviewReason: 'paddle_state' | 'binding'
) {
  await tx
    .update(sponsorRosterEntries)
    .set({ outcome: 'staff_review', reviewReason })
    .where(entryWhere(tenantId, entryId));
}

export async function settle(
  tx: TenantTransaction,
  tenantId: string,
  entryId: string,
  outcome: 'foreign' | 'not_eligible',
  kind: 'foreign_account' | 'not_eligible'
) {
  await mark(tx, tenantId, entryId, outcome);
  await tx
    .insert(sponsorMailOutbox)
    .values({
      id: nanoid(),
      tenantId,
      rosterEntryId: entryId,
      kind,
      idempotencyKey: `sponsor-entry:${entryId}:${kind}`,
    })
    .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
}

/** §3.3: the person's first row; after this, sponsor code writes only its `status`. */
export async function insertGroupSponsorRow(
  tx: TenantTransaction,
  facts: ProvisioningEntryFacts,
  userId: string
) {
  await tx
    .insert(subscriptions)
    .values({
      id: `sub_${nanoid()}`,
      tenantId: facts.tenantId,
      userId,
      status: 'active',
      planId: facts.planId,
      planKey: facts.planKey,
      provider: GROUP_SPONSOR_PROVIDER,
      branchId: facts.branchId,
      agentId: null,
      referredByAgentId: null,
      termsVersionAccepted: facts.termsVersion,
    })
    .onConflictDoNothing();
}
