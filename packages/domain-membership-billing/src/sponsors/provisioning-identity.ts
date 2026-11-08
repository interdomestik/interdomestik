import {
  and,
  eq,
  sponsorRosterEntries,
  sql,
  type TenantTransaction,
  user,
} from '@interdomestik/database';
import { ne } from 'drizzle-orm';
import { lockSponsorEntryIdentity } from '@interdomestik/database/sponsor-locks';
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
  | { kind: 'bound'; userId: string; created: boolean }
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
  return { kind: 'bound', userId, created };
}

async function visibleAccounts(
  tx: TenantTransaction,
  tenantId: string,
  emailNormalized: string
): Promise<{ id: string }[]> {
  return tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(sql`lower(btrim(${user.email}))`, emailNormalized)))
    .limit(2);
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
