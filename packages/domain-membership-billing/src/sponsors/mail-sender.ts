import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import type { SponsorMailInput } from './mail-input';
import {
  claimDueMail,
  finishMail,
  mailLeaseUntil,
  readClaimedMail,
  type MailFinish,
  type MailLease,
} from './mail-outbox';
import { prepareMail, type PreparedMail } from './mail-preparation';
import { optOutToken } from './roster-crypto';

export type { PreparedMail } from './mail-preparation';

type SendResult = { ok: boolean; code?: string };
type DispatchBlock = 'aged_mail' | 'lease_lost';
export type SponsorMailDeps = {
  secret: string;
  locale: 'sq' | 'en' | 'mk' | 'sr' | 'de';
  formatDate(date: Date): string;
  appUrl: string;
  supportEmail: string;
  hasCredential(userId: string): Promise<boolean>;
  sendMail(
    to: string,
    input: SponsorMailInput,
    dispatchBlock: () => DispatchBlock | null
  ): Promise<SendResult>;
  sendActivation(email: string): Promise<SendResult>;
  reportError(error: unknown, stage: 'prepare' | 'send' | 'finish'): void;
};

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
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
  deps: SponsorMailDeps,
  leaseUntil?: string
): Promise<MailFinish | 'lease_lost'> {
  if (mail.retentionDeadline && mail.retentionDeadline <= new Date()) {
    return { state: 'skipped', reason: 'aged_mail' };
  }
  if (!mail.check.send) return { state: 'skipped', reason: mail.check.reason };
  if (!mail.recipient) return { state: 'skipped', reason: 'recipient_missing' };
  const leaseExpiresAt = leaseUntil === undefined ? Infinity : Date.parse(leaseUntil);
  const dispatchBlock = (): DispatchBlock | null => {
    const now = Date.now();
    if (now < leaseExpiresAt) {
      return mail.retentionDeadline && now >= mail.retentionDeadline.getTime() ? 'aged_mail' : null;
    }
    return 'lease_lost';
  };
  try {
    const input = mail.kind === 'activation' ? null : sponsorMailInput(mail, deps);
    // Payload preparation can itself cross the deadline.
    const blocked = dispatchBlock();
    if (blocked === 'lease_lost') return blocked;
    if (blocked === 'aged_mail') return { state: 'skipped', reason: blocked };
    const result = input
      ? await deps.sendMail(mail.recipient, input, dispatchBlock)
      : await deps.sendActivation(mail.recipient);
    if (result.code === 'lease_lost') return result.code;
    if (result.code === 'aged_mail' || result.code === 'email_suppressed') {
      return { state: 'skipped', reason: result.code };
    }
    // There is no durable success counter. §brief fallback: finish activation after one success.
    return result.ok ? { state: 'sent' } : { state: 'error', code: 'send_failed' };
  } catch (error) {
    deps.reportError(error, 'send');
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
  let prepared: PreparedMail | MailFinish | null;
  try {
    prepared = await withTenantAuthority(authority, async tx => {
      const row = await readClaimedMail(tx, tenantId, lease);
      if (!row || new Date().toISOString() >= lease.leaseUntil) return null;
      return await prepareMail(tx, tenantId, row, deps, now);
    });
  } catch (error) {
    deps.reportError(error, 'prepare');
    return finishMail(authority, lease, { state: 'error', code: 'facts_unavailable' }, new Date());
  }
  if (!prepared || new Date().toISOString() >= lease.leaseUntil) return 'lease_lost';
  const result =
    'state' in prepared ? prepared : await deliverSponsorMail(prepared, deps, lease.leaseUntil);
  if (result === 'lease_lost') return result;
  return finishMail(authority, lease, result, new Date());
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
        } catch (error) {
          deps.reportError(error, 'finish');
          outcome = 'finish_failed'; // Lease recovery owns failures to persist a result.
        }
        summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
      }),
    Promise.resolve()
  );
  return summary;
}
