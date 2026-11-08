import {
  and,
  asc,
  eq,
  inArray,
  legalEntities,
  or,
  sponsorHandoverIntents,
  sponsorMailOutbox,
  sponsorRosterEntries,
  sponsors,
  sponsorTerms,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { lt, lte } from 'drizzle-orm';

import type { MailSkipReason } from './mail-checks';

export type MailRow = typeof sponsorMailOutbox.$inferSelect;
export type MailLease = { id: string; leaseUntil: string };
export type MailFinish =
  | { state: 'sent' }
  | { state: 'skipped'; reason: MailSkipReason }
  | { state: 'error'; code: 'send_failed' | 'send_exception' | 'facts_unavailable' };
type FinishState = 'sent' | 'skipped' | 'queued' | 'failed';
type FinishValues = Pick<MailRow, 'state' | 'terminalAt' | 'leaseUntil' | 'lastErrorCode'> & {
  state: FinishState;
  nextAttemptAt?: string;
};

export const mailLeaseUntil = (now: Date): string =>
  new Date(now.getTime() + 10 * 60_000).toISOString();

/** Claims count attempts, including abandoned leases; they cannot count successful activations. */
export function mailFinishValues(attempts: number, result: MailFinish, now: Date): FinishValues {
  if (result.state !== 'error') {
    return {
      state: result.state,
      terminalAt: now.toISOString(),
      leaseUntil: null,
      lastErrorCode: result.state === 'skipped' ? result.reason : null,
    };
  }
  const failed = attempts >= 8;
  const delay = Math.min(86_400_000, 15 * 60_000 * 2 ** Math.max(0, attempts - 1));
  return {
    state: failed ? 'failed' : 'queued',
    terminalAt: failed ? now.toISOString() : null,
    leaseUntil: null,
    lastErrorCode: result.code,
    ...(failed ? {} : { nextAttemptAt: new Date(now.getTime() + delay).toISOString() }),
  };
}

async function claimRows(
  tx: TenantTransaction,
  tenantId: string,
  now: Date,
  limit: number
): Promise<string[]> {
  const rows = await tx
    .select({ id: sponsorMailOutbox.id })
    .from(sponsorMailOutbox)
    .where(
      and(
        eq(sponsorMailOutbox.tenantId, tenantId),
        or(
          and(
            eq(sponsorMailOutbox.state, 'queued'),
            lte(sponsorMailOutbox.nextAttemptAt, now.toISOString())
          ),
          and(
            eq(sponsorMailOutbox.state, 'claimed'),
            lt(sponsorMailOutbox.leaseUntil, now.toISOString())
          )
        )
      )
    )
    .orderBy(asc(sponsorMailOutbox.nextAttemptAt), asc(sponsorMailOutbox.id))
    .limit(limit)
    .for('update', { skipLocked: true });
  const ids = rows.map(row => row.id);
  if (ids.length === 0) return [];
  await tx
    .update(sponsorMailOutbox)
    .set({
      state: 'claimed',
      leaseUntil: mailLeaseUntil(now),
      attempts: sql`${sponsorMailOutbox.attempts} + 1`,
    })
    .where(and(eq(sponsorMailOutbox.tenantId, tenantId), inArray(sponsorMailOutbox.id, ids)));
  return ids;
}

export async function claimDueMail(
  authority: TenantAuthority,
  now: Date,
  limit: number
): Promise<string[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx => claimRows(tx, tenantId, now, limit));
}

export async function readClaimedMail(
  tx: TenantTransaction,
  tenantId: string,
  lease: MailLease
): Promise<MailRow | null> {
  const [row] = await tx
    .select()
    .from(sponsorMailOutbox)
    .where(
      and(
        eq(sponsorMailOutbox.tenantId, tenantId),
        eq(sponsorMailOutbox.id, lease.id),
        eq(sponsorMailOutbox.state, 'claimed'),
        eq(sponsorMailOutbox.leaseUntil, lease.leaseUntil)
      )
    )
    .for('update');
  return row ?? null;
}

async function finishRow(
  tx: TenantTransaction,
  tenantId: string,
  lease: MailLease,
  result: MailFinish,
  now: Date
): Promise<FinishState | 'lease_lost'> {
  const row = await readClaimedMail(tx, tenantId, lease);
  if (!row) return 'lease_lost';
  const values = mailFinishValues(row.attempts, result, now);
  const updated = await tx
    .update(sponsorMailOutbox)
    .set(values)
    .where(
      and(
        eq(sponsorMailOutbox.tenantId, tenantId),
        eq(sponsorMailOutbox.id, lease.id),
        eq(sponsorMailOutbox.state, 'claimed'),
        eq(sponsorMailOutbox.leaseUntil, lease.leaseUntil)
      )
    )
    .returning({ id: sponsorMailOutbox.id });
  return updated.length > 0 ? values.state : 'lease_lost';
}

export async function finishMail(
  authority: TenantAuthority,
  lease: MailLease,
  result: MailFinish,
  now: Date
): Promise<FinishState | 'lease_lost'> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx => finishRow(tx, tenantId, lease, result, now));
}

type EntryTarget = {
  entry: typeof sponsorRosterEntries.$inferSelect;
  companyName: string;
  entityName: string | null;
  legalEntityId: string;
  dispatchPeriodEndsAt: string | null;
  effectiveEnd: string;
};
export async function readEntryTarget(
  tx: TenantTransaction,
  tenantId: string,
  entryId: string
): Promise<EntryTarget | null> {
  const [row] = await tx
    .select({
      entry: sponsorRosterEntries,
      companyName: sponsors.legalName,
      entityName: legalEntities.legalName,
      legalEntityId: sponsorTerms.legalEntityId,
      dispatchPeriodEndsAt: sponsorHandoverIntents.dispatchPeriodEndsAt,
      effectiveEnd: sql<string>`coalesce(${sponsorTerms.terminatedEffectiveAt}, ${sponsorTerms.termEnd})`,
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
      legalEntities,
      and(
        eq(legalEntities.tenantId, sponsorTerms.tenantId),
        eq(legalEntities.id, sponsorTerms.legalEntityId)
      )
    )
    .leftJoin(
      sponsorHandoverIntents,
      and(
        eq(sponsorHandoverIntents.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorHandoverIntents.id, sponsorRosterEntries.handoverIntentId)
      )
    )
    .where(and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entryId)));
  return row ?? null;
}
