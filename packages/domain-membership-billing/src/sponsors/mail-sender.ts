import {
  and,
  eq,
  sponsorHandoverIntents,
  type TenantTransaction,
  user,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { type CoverageEntry, deriveEntryIntervals, entryEnd } from '../sponsor-coverage/evaluate';
import { parseTimestamp, readPersonCoverage } from '../sponsor-coverage/resolve';
import { checkSponsorMail, type SponsorMailCheck } from './mail-checks';
import type { SponsorMailInput } from './mail-input';
import {
  claimDueMail,
  finishMail,
  mailLeaseUntil,
  readClaimedMail,
  readEntryTarget,
  type MailFinish,
  type MailLease,
  type MailRow,
} from './mail-outbox';
import { nonSponsorGrantsAccess } from './mail-producers';
import { readProvisioningFacts } from './provisioning-facts';
import { optOutToken } from './roster-crypto';

type SendResult = { ok: boolean; code?: string };
export type SponsorMailDeps = {
  secret: string;
  locale: 'sq' | 'en' | 'mk' | 'sr' | 'de';
  formatDate(date: Date): string;
  appUrl: string;
  supportEmail: string;
  hasCredential(userId: string): Promise<boolean>;
  sendMail(to: string, input: SponsorMailInput): Promise<SendResult>;
  sendActivation(email: string): Promise<SendResult>;
};
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

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

function preparedMailEnd(
  entry: CoverageEntry | null,
  target: Awaited<ReturnType<typeof readEntryTarget>>
): Date | null {
  if (entry) return entryEnd(entry);
  return target ? parseTimestamp(target.effectiveEnd) : null;
}

async function prepareMail(
  tx: TenantTransaction,
  tenantId: string,
  row: MailRow,
  deps: SponsorMailDeps,
  now: Date
): Promise<PreparedMail> {
  const target = row.rosterEntryId ? await readEntryTarget(tx, tenantId, row.rosterEntryId) : null;
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
  };
}

export function sponsorMailInput(mail: PreparedMail, deps: SponsorMailDeps): SponsorMailInput {
  const common = {
    locale: deps.locale,
    firstName: mail.firstName,
    supportEmail: deps.supportEmail,
    companyName: mail.companyName,
  };
  const base = trimTrailingSlashes(deps.appUrl);
  switch (mail.kind) {
    case 'sponsor_notice':
      if (!mail.entryId || !mail.start || !mail.end) throw new Error('mail_facts_missing');
      return {
        ...common,
        kind: mail.kind,
        entityName: mail.entityName,
        startDate: deps.formatDate(mail.start),
        termEnd: deps.formatDate(mail.end),
        loginUrl: `${base}/${deps.locale}/login`,
        optOutUrl: `${base}/sponsor/opt-out/${optOutToken(deps.secret, mail.entryId)}`,
      };
    case 'handover_confirmed':
      if (!mail.start) throw new Error('mail_facts_missing');
      return { ...common, kind: mail.kind, startDate: deps.formatDate(mail.start) };
    case 'renewal_notice':
      if (!mail.end) throw new Error('mail_facts_missing');
      return { ...common, kind: mail.kind, termEnd: deps.formatDate(mail.end) };
    case 'membership_end_offer':
      return { ...common, kind: mail.kind, offerUrl: `${base}/${deps.locale}/pricing` };
    case 'activation':
      throw new Error('activation_requires_auth_helper');
    default:
      return { ...common, kind: mail.kind };
  }
}

/** Called after the read transaction commits. No provider response text is persisted. */
export async function deliverSponsorMail(
  mail: PreparedMail,
  deps: SponsorMailDeps
): Promise<MailFinish> {
  if (!mail.check.send) return { state: 'skipped', reason: mail.check.reason };
  if (!mail.recipient) return { state: 'skipped', reason: 'recipient_missing' };
  try {
    const result =
      mail.kind === 'activation'
        ? await deps.sendActivation(mail.recipient)
        : await deps.sendMail(mail.recipient, sponsorMailInput(mail, deps));
    if (result.code === 'email_suppressed') return { state: 'skipped', reason: 'email_suppressed' };
    // There is no durable success counter. §brief fallback: finish activation after one success.
    return result.ok ? { state: 'sent' } : { state: 'error', code: 'send_failed' };
  } catch {
    return { state: 'error', code: 'send_exception' };
  }
}

async function runMail(
  authority: TenantAuthority,
  deps: SponsorMailDeps,
  lease: MailLease,
  now: Date
): Promise<string> {
  const { tenantId } = readTenantAuthority(authority);
  let prepared: PreparedMail | null;
  try {
    prepared = await withTenantAuthority(authority, async tx => {
      const row = await readClaimedMail(tx, tenantId, lease);
      if (!row) return null;
      return await prepareMail(tx, tenantId, row, deps, now);
    });
  } catch {
    return finishMail(authority, lease, { state: 'error', code: 'facts_unavailable' }, now);
  }
  if (!prepared) return 'lease_lost';
  return finishMail(authority, lease, await deliverSponsorMail(prepared, deps), now);
}

export type SponsorMailSummary = { claimed: number; outcomes: Record<string, number> };

export async function runSponsorMailOutbox(
  authority: TenantAuthority,
  deps: SponsorMailDeps,
  options: { now: Date; limit: number }
): Promise<SponsorMailSummary> {
  const ids = await claimDueMail(authority, options.now, options.limit);
  const summary: SponsorMailSummary = { claimed: ids.length, outcomes: {} };
  await ids.reduce<Promise<void>>(
    (previous, id) =>
      previous.then(async () => {
        let outcome: string;
        try {
          outcome = await runMail(
            authority,
            deps,
            { id, leaseUntil: mailLeaseUntil(options.now) },
            options.now
          );
        } catch {
          outcome = 'finish_failed'; // Lease recovery owns failures to persist a result.
        }
        summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
      }),
    Promise.resolve()
  );
  return summary;
}
