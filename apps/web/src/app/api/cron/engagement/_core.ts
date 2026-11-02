import {
  sendCheckinEmail,
  sendEngagementDay30Email,
  sendEngagementDay60Email,
  sendEngagementDay90Email,
  sendOnboardingEmail,
} from '@/lib/email';

import {
  ENGAGEMENT_CADENCE,
  getDayWindow,
  type EngagementCadence,
} from '@/lib/cron/engagement-schedule';

import {
  authorityForTenant,
  createPendingEngagementSend,
  loadScheduledAuthorities,
} from '../_engagement-email-sends';
import { selectActiveSubscriptionMembers } from '../_scheduled-members';
import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  processSeasonalEngagement,
  handleSuccess,
  handleFailure,
  markAsSkipped,
  markAsError,
} from './_seasonal';

export type EngagementCronResults = {
  day7: number;
  day14: number;
  day30: number;
  day60: number;
  day90: number;
  seasonal: number;
  annual: number;
  skipped: number;
  errors: number;
};

export type EngagementMember = {
  userId: string | null;
  subId: string;
  tenantId: string | null;
  name: string | null;
  email: string | null;
};

export async function runEngagementCronCore(args: {
  ingress: IngressCapability<'cron'>;
  now: Date;
  headers: Headers;
}): Promise<EngagementCronResults> {
  const { ingress, now, headers } = args;

  const results: EngagementCronResults = {
    day7: 0,
    day14: 0,
    day30: 0,
    day60: 0,
    day90: 0,
    seasonal: 0,
    annual: 0,
    skipped: 0,
    errors: 0,
  };

  // Each member is processed under the scheduled-work authority of its own tenant.
  const authorities = await loadScheduledAuthorities(ingress);

  await processLifecycleEngagement(ingress, authorities, now, headers, results);
  await processSeasonalEngagement(ingress, authorities, now, headers, results);

  return results;
}

async function processLifecycleEngagement(
  ingress: IngressCapability<'cron'>,
  authorities: ReadonlyMap<string, TenantAuthority>,
  now: Date,
  headers: Headers,
  results: EngagementCronResults
) {
  for (const cadence of ENGAGEMENT_CADENCE) {
    const { start, end } = getDayWindow(now, cadence.daysSinceSubscriptionCreated);

    const members = await selectActiveSubscriptionMembers({
      ingress,
      limit: 200,
      createdBetween: { start, end },
    });

    for (const member of members) {
      await processMemberEngagement(
        member,
        authorityForTenant(authorities, member.tenantId),
        cadence,
        results,
        headers
      );
    }
  }
}

async function processMemberEngagement(
  member: EngagementMember,
  authority: TenantAuthority | null,
  cadence: EngagementCadence,
  results: EngagementCronResults,
  headers: Headers
) {
  const templateKey = cadence.templateKey;
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
      scheduledDays: cadence.daysSinceSubscriptionCreated,
    },
  });

  if (inserted.length === 0) return;

  if (!member.email || !member.name) {
    await markAsSkipped(dedupeKey, authority, 'Missing recipient email or name');
    results.skipped++;
    return;
  }

  try {
    const sendResult = await sendEngagementEmail(templateKey, member);
    await handleLifecycleSendResult(
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

async function sendEngagementEmail(templateKey: string, member: EngagementMember) {
  if (!member.email || !member.name) return { success: false, error: 'Missing email or name' };
  if (templateKey === 'onboarding') return await sendOnboardingEmail(member.email, member.name);
  if (templateKey === 'checkin') return await sendCheckinEmail(member.email, member.name);
  if (templateKey === 'day30') return await sendEngagementDay30Email(member.email, member.name);
  if (templateKey === 'day60') return await sendEngagementDay60Email(member.email, member.name);
  if (templateKey === 'day90') return await sendEngagementDay90Email(member.email, member.name);
  return { success: false, error: 'Unknown template' };
}

async function handleLifecycleSendResult(
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
    updateLifecycleStats(results, templateKey);
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

function updateLifecycleStats(results: EngagementCronResults, templateKey: string) {
  const keyMap: Record<string, keyof EngagementCronResults> = {
    onboarding: 'day7',
    checkin: 'day14',
    day30: 'day30',
    day60: 'day60',
    day90: 'day90',
  };
  const statKey = keyMap[templateKey];
  if (statKey) results[statKey]++;
}
