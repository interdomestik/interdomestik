import { and, eq, subscriptions, type TenantTransaction, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { admitPersonEntries } from '../sponsor-coverage/admission';
import { produceEntryStart } from '../sponsor-coverage/entry-start';
import { deriveEntryIntervals } from '../sponsor-coverage/evaluate';
import {
  classifyProvisioning,
  type SubscriptionStatus,
} from '../sponsor-coverage/provisioning-case';
import { readPersonCoverage } from '../sponsor-coverage/resolve';
import { insertGroupSponsorRow, mark, review, setStart, settle } from './provisioning-effects';
import { readProvisioningFacts, type ProvisioningEntryFacts } from './provisioning-facts';
import { bindEntryIdentity } from './provisioning-identity';
import { linkHandoverIntent } from './provisioning-intent';

export type ProvisionOutcome =
  | 'skipped'
  | 'waiting'
  | 'rejected'
  | 'foreign'
  | 'not_eligible'
  | 'staff_review'
  | 'seated'
  | 'awaiting_paid_end';

export type ProvisionResult = { outcome: ProvisionOutcome; createdUserId: string | null };

const later = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);

/**
 * ACQ-3b §3.7 one person job: binds the entry (lock 1), admits the person's entries (lock 2 →
 * terms → entries), then applies the provisioning case. Before `term_start` only handover
 * preparation runs: binding, admission and linking an `active` Paddle member's intent.
 */
export async function provisionEntry(
  authority: TenantAuthority,
  input: {
    entryId: string;
    now: Date;
    /** Whether the account has a password credential (§3.7 activation); a snapshot read. */
    hasCredential: (userId: string) => Promise<boolean>;
  }
): Promise<ProvisionResult> {
  const { tenantId } = readTenantAuthority(authority);
  const { now } = input;
  return withTenantAuthority(authority, async tx => {
    const skip = { outcome: 'skipped', createdUserId: null } as const;
    const facts = await readProvisioningFacts(tx, tenantId, input.entryId);
    if (!facts || facts.revoked || facts.outcome !== 'pending' || now >= facts.effectiveEnd) {
      return skip;
    }
    const started = facts.termStart.getTime() <= now.getTime();
    let userId = facts.userId;
    let created = false;
    if (!userId) {
      if (!facts.emailHmac || !facts.emailNormalized) return skip;
      const identity = await bindEntryIdentity(tx, {
        tenantId,
        entry: {
          id: input.entryId,
          termId: facts.termId,
          emailHmac: facts.emailHmac,
          emailNormalized: facts.emailNormalized,
          firstName: facts.firstName,
          lastName: facts.lastName,
        },
        branchId: facts.branchId,
        mayCreate: started,
        now,
      });
      if (identity.kind === 'wait') return { outcome: 'waiting', createdUserId: null };
      if (identity.kind === 'foreign') {
        await settle(tx, tenantId, input.entryId, 'foreign', 'foreign_account');
        return { outcome: 'foreign', createdUserId: null };
      }
      if (identity.kind === 'binding_review') {
        await review(tx, tenantId, input.entryId, 'binding');
        return { outcome: 'staff_review', createdUserId: null };
      }
      userId = identity.userId;
      created = identity.created;
    }
    const decisions = await admitPersonEntries(tx, tenantId, userId);
    const decided = decisions.find(item => item.entryId === input.entryId)?.decision;
    if (decided === 'rejected' || (!decided && facts.conflictDecision !== 'accepted')) {
      return { outcome: 'rejected', createdUserId: null };
    }
    const outcome = await applyCase(tx, {
      facts,
      userId,
      created,
      started,
      now,
      hasCredential: input.hasCredential,
    });
    return { outcome, createdUserId: created ? userId : null };
  });
}

type CaseInput = {
  facts: ProvisioningEntryFacts;
  userId: string;
  created: boolean;
  started: boolean;
  now: Date;
  hasCredential: (userId: string) => Promise<boolean>;
};

async function applyCase(tx: TenantTransaction, input: CaseInput): Promise<ProvisionOutcome> {
  const { facts, userId, now } = input;
  const { tenantId, entryId } = facts;
  const [person] = await tx
    .select({ role: user.role })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.id, userId)))
    .for('share');
  const [row] = await tx
    .select({
      id: subscriptions.id,
      provider: subscriptions.provider,
      status: subscriptions.status,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.userId, userId)));
  const kase = classifyProvisioning(
    input.created
      ? { kind: 'created' }
      : person
        ? {
            kind: 'visible',
            role: person.role,
            subscription: row
              ? { provider: row.provider, status: row.status as SubscriptionStatus }
              : null,
          }
        : { kind: 'not_visible' }
  );
  const hasCredential = async () => (input.created ? false : input.hasCredential(userId));

  if (
    input.started &&
    kase !== 'handover' &&
    kase !== 'paddle_review' &&
    person?.role === 'member'
  ) {
    const continuing = await continuingInterval(tx, tenantId, userId, entryId);
    if (continuing) {
      await setStart(tx, tenantId, entryId, facts.termStart);
      return startOutcome(
        await produceEntryStart(tx, {
          tenantId,
          entryId,
          interval: continuing,
          handover: false,
          hasCredential: await hasCredential(),
        })
      );
    }
  }

  if (kase === 'handover' || kase === 'paddle_review') {
    if (!row) return 'skipped';
    if (kase === 'paddle_review' && !input.started) return 'waiting';
    const link = await linkHandoverIntent(tx, {
      tenantId,
      entryId,
      userId,
      subscription: row,
      mode: kase,
    });
    if (link.kind === 'review' || kase === 'paddle_review') {
      await review(tx, tenantId, entryId, 'paddle_state');
      return 'staff_review';
    }
    if (link.kind === 'linked') {
      await mark(tx, tenantId, entryId, 'awaiting_paid_end');
      if (!link.paidUntil) return 'awaiting_paid_end';
      return startOutcome(
        await produceEntryStart(tx, {
          tenantId,
          entryId,
          interval: { start: later(facts.termStart, link.paidUntil), end: facts.effectiveEnd },
          handover: true,
          hasCredential: await hasCredential(),
        })
      );
    }
    if (!input.started) return 'waiting';
  } else if (!input.started) {
    return 'waiting';
  }

  if (kase === 'foreign') {
    await settle(tx, tenantId, entryId, 'foreign', 'foreign_account');
    return 'foreign';
  }
  if (kase === 'not_eligible') {
    await settle(tx, tenantId, entryId, 'not_eligible', 'not_eligible');
    return 'not_eligible';
  }
  // new_user, immediate, or a handover that fell back to the immediate path.
  if (!row) await insertGroupSponsorRow(tx, facts, userId);
  await setStart(tx, tenantId, entryId, now);
  return startOutcome(
    await produceEntryStart(tx, {
      tenantId,
      entryId,
      interval: { start: later(facts.termStart, now), end: facts.effectiveEnd },
      handover: false,
      hasCredential: await hasCredential(),
    })
  );
}

const startOutcome = (plan: { outcome: 'seated' | 'staff_review' }): ProvisionOutcome =>
  plan.outcome;

/** Rule 2: the entry already covers from `term_start` through the same sponsor's chain. */
async function continuingInterval(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  entryId: string
) {
  const person = await readPersonCoverage(tx, tenantId, userId);
  if (!person) return null;
  return deriveEntryIntervals(person.entries).get(entryId) ?? null;
}
