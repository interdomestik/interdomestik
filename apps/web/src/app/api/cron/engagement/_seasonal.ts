import { logAuditEvent } from '@/lib/audit';
import { sendSeasonalEmail } from '@/lib/email';
import {
  authorityForTenant,
  createPendingEngagementSend,
  updateEngagementSend,
} from '../_engagement-email-sends';
import { selectActiveSubscriptionMembers } from '../_scheduled-members';
import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { EngagementCronResults, EngagementMember } from './_core';
import { forEachInOrder } from '@/lib/in-order';

export async function processSeasonalEngagement(
  ingress: IngressCapability<'cron'>,
  authorities: ReadonlyMap<string, TenantAuthority>,
  now: Date,
  headers: Headers,
  results: EngagementCronResults
) {
  const month = now.getMonth();
  const day = now.getDate();
  let season: 'winter' | 'summer' | null = null;

  if (month === 10 && day === 1) season = 'winter';
  if (month === 5 && day === 1) season = 'summer';

  if (!season) return;

  const templateKey = `seasonal_${season}_${now.getFullYear()}`;
  const seasonalMembers = await selectActiveSubscriptionMembers({ ingress, limit: 100 });

  await forEachInOrder(seasonalMembers, async member => {
    await processSeasonalMember(
      member,
      authorityForTenant(authorities, member.tenantId),
      season,
      templateKey,
      now,
      results,
      headers
    );
  });
}

export async function processSeasonalMember(
  member: EngagementMember,
  authority: TenantAuthority | null,
  season: string,
  templateKey: string,
  now: Date,
  results: EngagementCronResults,
  headers: Headers
) {
  const dedupeKey = `engagement:${member.subId}:${templateKey}`;

  if (!authority || !member.userId) {
    results.skipped++;
    return;
  }
  const userId = member.userId;

  const inserted = await createPendingEngagementSend({
    authority,
    userId,
    subscriptionId: member.subId,
    templateKey,
    dedupeKey,
    metadata: {
      season,
      year: now.getFullYear(),
    },
  });

  if (inserted.length === 0) return;

  if (!member.email || !member.name) {
    await markAsSkipped(dedupeKey, authority, 'Missing recipient email or name');
    results.skipped++;
    return;
  }

  try {
    const sendResult = await sendSeasonalEmail(member.email, {
      season: season as 'winter' | 'summer',
      name: member.name,
    });
    await handleSeasonalSendResult(
      sendResult,
      dedupeKey,
      member,
      authority,
      templateKey,
      results,
      headers
    );
  } catch {
    results.errors++;
    await markAsError(dedupeKey, authority, 'Unhandled exception during send');
  }
}

export async function handleSeasonalSendResult(
  sendResult: { success: boolean; id?: string; error?: string },
  dedupeKey: string,
  member: EngagementMember,
  authority: TenantAuthority,
  templateKey: string,
  results: EngagementCronResults,
  headers: Headers
) {
  if (sendResult.success) {
    await handleSuccess(dedupeKey, member, authority, templateKey, headers, sendResult.id);
    results.seasonal++;
  } else {
    await handleFailure(
      dedupeKey,
      member,
      authority,
      templateKey,
      results,
      headers,
      sendResult.error
    );
  }
}

export async function handleSuccess(
  dedupeKey: string,
  member: EngagementMember,
  authority: TenantAuthority,
  templateKey: string,
  headers: Headers,
  providerMessageId?: string
) {
  await updateEngagementSend(authority, dedupeKey, {
    status: 'sent',
    providerMessageId: providerMessageId || null,
    sentAt: new Date(),
  });

  await logAuditEvent({
    actorId: null,
    actorRole: 'system',
    authority,
    action: 'email.engagement.sent',
    entityType: 'subscription',
    entityId: member.subId,
    metadata: { templateKey },
    headers,
  });
}

export async function handleFailure(
  dedupeKey: string,
  member: EngagementMember,
  authority: TenantAuthority,
  templateKey: string,
  results: EngagementCronResults,
  headers: Headers,
  error: string = 'Unknown error'
) {
  const status = ['Resend not configured', 'email_suppressed'].includes(error ?? '')
    ? 'skipped'
    : 'error';

  await updateEngagementSend(authority, dedupeKey, { status, error });

  if (status === 'skipped') results.skipped++;
  else results.errors++;

  await logAuditEvent({
    actorId: null,
    actorRole: 'system',
    authority,
    action: 'email.engagement.failed',
    entityType: 'subscription',
    entityId: member.subId,
    metadata: { templateKey, error },
    headers,
  });
}

export async function markAsSkipped(dedupeKey: string, authority: TenantAuthority, reason: string) {
  await updateEngagementSend(authority, dedupeKey, { status: 'skipped', error: reason });
}

export async function markAsError(dedupeKey: string, authority: TenantAuthority, reason: string) {
  await updateEngagementSend(authority, dedupeKey, { status: 'error', error: reason });
}
