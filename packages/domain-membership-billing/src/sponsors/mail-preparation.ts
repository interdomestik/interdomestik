import {
  and,
  eq,
  sponsorHandoverIntents,
  type TenantTransaction,
  user,
} from '@interdomestik/database';
import { type CoverageEntry, deriveEntryIntervals, entryEnd } from '../sponsor-coverage/evaluate';
import { parseTimestamp, readPersonCoverage } from '../sponsor-coverage/resolve';
import { checkSponsorMail, type SponsorMailCheck } from './mail-checks';
import { readEntryTarget, type MailFinish, type MailRow } from './mail-outbox';
import { nonSponsorGrantsAccess } from './mail-producers';
import { readProvisioningFacts } from './provisioning-facts';
import { sponsorRosterRetentionDeadline } from './retention-plan';
import type { SponsorMailDeps } from './mail-sender';

export type PreparedMail = {
  kind: MailRow['kind'];
  entryId: string | null;
  recipient: string | null;
  firstName: string | null;
  companyName: string;
  entityName: string;
  start: Date | null;
  end: Date | null;
  check: SponsorMailCheck;
  retentionDeadline: Date | null;
};

async function readMailIntent(
  tx: TenantTransaction,
  tenantId: string,
  intentId: string | null,
  userId: string | null
): Promise<{ id: string } | undefined> {
  if (!intentId || !userId) return undefined;
  const [intent] = await tx
    .select({ id: sponsorHandoverIntents.id })
    .from(sponsorHandoverIntents)
    .where(
      and(
        eq(sponsorHandoverIntents.tenantId, tenantId),
        eq(sponsorHandoverIntents.id, intentId),
        eq(sponsorHandoverIntents.userId, userId)
      )
    );
  return intent;
}

function hasActivationCredential(
  kind: MailRow['kind'],
  userId: string | null,
  userExists: boolean,
  deps: SponsorMailDeps
): Promise<boolean> {
  if (kind !== 'activation' || !userId || !userExists) return Promise.resolve(false);
  return deps.hasCredential(userId);
}

function assertMailOrigin(
  entryId: MailRow['rosterEntryId'],
  target: Awaited<ReturnType<typeof readEntryTarget>>
): void {
  if (entryId !== null && target?.entry.id !== entryId) {
    throw new Error('Sponsor mail originating entry or term unavailable');
  }
}

function preparedMailEnd(
  entry: CoverageEntry | null,
  target: Awaited<ReturnType<typeof readEntryTarget>>
): Date | null {
  if (entry) return entryEnd(entry);
  return target ? parseTimestamp(target.effectiveEnd) : null;
}

export async function prepareMail(
  tx: TenantTransaction,
  tenantId: string,
  row: MailRow,
  deps: SponsorMailDeps,
  now: Date
): Promise<PreparedMail | MailFinish> {
  const target = row.rosterEntryId ? await readEntryTarget(tx, tenantId, row.rosterEntryId) : null;
  assertMailOrigin(row.rosterEntryId, target);
  const retentionDeadline = target ? sponsorRosterRetentionDeadline(target.termEnd) : null;
  if (retentionDeadline && retentionDeadline <= new Date()) {
    return { state: 'skipped', reason: 'aged_mail' };
  }
  const userId = target?.entry.userId ?? row.userId;
  const [account] = userId
    ? await tx
        .select({ email: user.email })
        .from(user)
        .where(and(eq(user.tenantId, tenantId), eq(user.id, userId)))
    : [];
  const person = account && userId ? await readPersonCoverage(tx, tenantId, userId) : null;
  const entry = person?.entries.find(item => item.id === row.rosterEntryId) ?? null;
  const recipient = userId ? (account?.email ?? null) : (target?.entry.emailNormalized ?? null);
  const unbound =
    target && !userId ? await readProvisioningFacts(tx, tenantId, target.entry.id) : null;
  const intent = await readMailIntent(tx, tenantId, row.handoverIntentId, userId);
  const entries = person?.entries ?? [];
  const interval = entry ? deriveEntryIntervals(entries).get(entry.id) : null;
  const check = checkSponsorMail(
    row.kind,
    {
      entry,
      entries,
      userId,
      userExists: !!account && (!row.handoverIntentId || !!intent),
      hasRecipient: !!recipient,
      entryExists: !!target,
      entryRevoked: !!target?.entry.revokedAt,
      termEffective: entry?.termEffective ?? !!unbound,
      optedOut: target?.entry.optedOutAt !== null && target?.entry.optedOutAt !== undefined,
      intentAddressed: row.handoverIntentId !== null,
      dispatchPeriodEndsAt: target?.dispatchPeriodEndsAt
        ? parseTimestamp(target.dispatchPeriodEndsAt)
        : null,
      hasCredential: await hasActivationCredential(row.kind, userId, !!account, deps),
      nonSponsorCovered: nonSponsorGrantsAccess(person?.subscription ?? null, now),
    },
    now
  );
  return {
    kind: row.kind,
    entryId: row.rosterEntryId,
    recipient,
    firstName: target?.entry.firstName ?? null,
    companyName: target?.companyName ?? '',
    entityName: target?.entityName ?? target?.legalEntityId ?? '',
    start: interval?.start ?? null,
    end: preparedMailEnd(entry, target),
    check,
    retentionDeadline,
  };
}
