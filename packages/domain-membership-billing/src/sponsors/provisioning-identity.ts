import {
  and,
  asc,
  eq,
  inArray,
  or,
  sponsorRosterEntries,
  sponsorTerms,
  sql,
  type TenantTransaction,
  user,
} from '@interdomestik/database';
import { ne } from 'drizzle-orm';
import { lockSponsorEntryIdentity, lockSponsorPerson } from '@interdomestik/database/sponsor-locks';
import { nanoid } from 'nanoid';

/**
 * ACQ-3b §3.5/§3.7 identity binding for one unbound entry, under lock 1. The address is matched
 * against the users this tenant can see; a new account is created only while the term is
 * provisioning (`mayCreate`). `user_id` is set once and never changed afterwards.
 */
export type UnboundEntry = {
  id: string;
  termId: string;
  emailHmac: string;
  emailNormalized: string;
  firstName: string | null;
  lastName: string | null;
};

export type IdentityResult =
  /** `lockedTermIds`: the terms this binding holds `FOR SHARE`, the admission scope after it. */
  | { kind: 'bound'; userId: string; created: boolean; lockedTermIds?: string[] }
  /** The address belongs to an account outside this tenant. */
  | { kind: 'foreign' }
  /** The address cannot be bound to exactly one person of this term. */
  | { kind: 'binding_review' }
  /** No account yet and the term has not started: nothing to do before `term_start`. */
  | { kind: 'wait' };

export async function bindEntryIdentity(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    entry: UnboundEntry;
    branchId: string;
    mayCreate: boolean;
    now: Date;
  }
): Promise<IdentityResult> {
  const { tenantId, entry } = params;
  await lockSponsorEntryIdentity(tx, entry.emailHmac);
  const [current] = await tx
    .select({ userId: sponsorRosterEntries.userId })
    .from(sponsorRosterEntries)
    .where(and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entry.id)));
  if (current?.userId) return { kind: 'bound', userId: current.userId, created: false };

  const visible = await visibleAccounts(tx, tenantId, entry.emailNormalized);
  if (visible.length > 1) return { kind: 'binding_review' };

  const existing = visible[0]?.id ?? null;
  if (!existing && !params.mayCreate) return { kind: 'wait' };
  const createdId = existing ? null : await createSponsoredMember(tx, params);
  let userId = existing ?? createdId;
  if (!userId) {
    // The insert met an address taken meanwhile; a same-tenant signup that just committed is
    // visible to this new statement and is bound like any existing account.
    const raced = await visibleAccounts(tx, tenantId, entry.emailNormalized);
    if (raced.length > 1) return { kind: 'binding_review' };
    userId = raced[0]?.id ?? null;
  }
  if (!userId) return { kind: 'foreign' };
  const created = createdId !== null;
  const lockedTermIds = await lockBindingRows(tx, tenantId, userId, entry.id);

  const [taken] = await tx
    .select({ id: sponsorRosterEntries.id })
    .from(sponsorRosterEntries)
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        eq(sponsorRosterEntries.termId, entry.termId),
        eq(sponsorRosterEntries.userId, userId),
        ne(sponsorRosterEntries.id, entry.id)
      )
    )
    .limit(1);
  if (taken) return { kind: 'binding_review' };

  await tx
    .update(sponsorRosterEntries)
    .set({ userId })
    .where(and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entry.id)));
  return { kind: 'bound', userId, created, lockedTermIds };
}

/**
 * §3.5 order before the binding write, as admission and retention expect: lock 2, then the
 * person's terms and this entry's term `FOR SHARE`, then those entries `FOR UPDATE`, in id order.
 * Writing the entry first would hold its row while waiting for a term retention already holds.
 * Only entries of the terms locked here are locked: an entry uploaded meanwhile into another term
 * is left to admission, which takes that term before its entries (never a term after an entry).
 */
async function lockBindingRows(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  entryId: string
): Promise<string[]> {
  await lockSponsorPerson(tx, userId);
  const rows = and(
    eq(sponsorRosterEntries.tenantId, tenantId),
    or(eq(sponsorRosterEntries.userId, userId), eq(sponsorRosterEntries.id, entryId))
  );
  const termIds = tx
    .select({ termId: sponsorRosterEntries.termId })
    .from(sponsorRosterEntries)
    .where(rows);
  const locked = await tx
    .select({ id: sponsorTerms.id })
    .from(sponsorTerms)
    .where(and(eq(sponsorTerms.tenantId, tenantId), inArray(sponsorTerms.id, termIds)))
    .orderBy(asc(sponsorTerms.id))
    .for('share');
  const lockedTermIds = locked.map(term => term.id);
  if (lockedTermIds.length > 0) {
    await tx
      .select({ id: sponsorRosterEntries.id })
      .from(sponsorRosterEntries)
      .where(and(rows, inArray(sponsorRosterEntries.termId, lockedTermIds)))
      .orderBy(asc(sponsorRosterEntries.id))
      .for('update');
  }
  return lockedTermIds;
}

function visibleAccounts(
  tx: TenantTransaction,
  tenantId: string,
  emailNormalized: string
): Promise<{ id: string }[]> {
  return Promise.resolve(
    tx
      .select({ id: user.id })
      .from(user)
      .where(
        and(eq(user.tenantId, tenantId), eq(sql`lower(btrim(${user.email}))`, emailNormalized))
      )
      .limit(2)
  );
}

/**
 * Inserts an unverified member whose provenance is the entry. A target-less `ON CONFLICT DO
 * NOTHING` that inserts nothing means the address is taken by an account this tenant cannot see.
 */
async function createSponsoredMember(
  tx: TenantTransaction,
  params: { tenantId: string; entry: UnboundEntry; branchId: string; now: Date }
): Promise<string | null> {
  const { entry } = params;
  const id = `usr_${nanoid()}`;
  const name = [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim();
  const inserted = await tx
    .insert(user)
    .values({
      id,
      tenantId: params.tenantId,
      email: entry.emailNormalized,
      name: name === '' ? entry.emailNormalized : name,
      role: 'member',
      // Unverified: the list does not prove the mailbox; activation lets the member set a password.
      emailVerified: false,
      createdBy: 'sponsor',
      createdAt: params.now,
      updatedAt: params.now,
      branchId: params.branchId,
    })
    .onConflictDoNothing()
    .returning({ id: user.id });
  return inserted.length > 0 ? id : null;
}
