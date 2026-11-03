import { logAuditEvent } from '@/lib/audit';
import { sendPaymentFinalWarningEmail, sendPaymentReminderEmail } from '@/lib/email';
import { listScheduledTenantWork, subscriptions, user } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { and, eq, gt } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { forEachInOrder } from '@/lib/in-order';

export type DunningCronStats = {
  checked: number;
  day7Sent: number;
  day13Sent: number;
  errors: number;
};

type SubscriptionRecord = typeof subscriptions.$inferSelect;

export async function runDunningCronCore(args: {
  ingress: IngressCapability<'cron'>;
  now: Date;
  headers: Headers;
}): Promise<{ stats: DunningCronStats }> {
  const { ingress, now, headers } = args;

  const stats: DunningCronStats = {
    checked: 0,
    day7Sent: 0,
    day13Sent: 0,
    errors: 0,
  };

  // Per-tenant cursor: each tenant's past-due subscriptions are paged under its own RLS context.
  for (const { tenantId, authority } of await listScheduledTenantWork(ingress)) {
    let afterId: string | null = null;

    while (true) {
      const conditions = [
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.status, 'past_due'),
        gt(subscriptions.gracePeriodEndsAt, now),
      ];
      if (afterId) {
        conditions.push(gt(subscriptions.id, afterId));
      }

      const pastDueSubscriptions = await withTenantAuthority(authority, tx =>
        tx.query.subscriptions.findMany({
          where: and(...conditions),
          orderBy: (subscriptions, { asc }) => [asc(subscriptions.id)],
          limit: 200,
        })
      );

      if (pastDueSubscriptions.length === 0) break;

      stats.checked += pastDueSubscriptions.length;

      await processBatch({
        authority,
        subscriptions: pastDueSubscriptions as (SubscriptionRecord & {
          gracePeriodEndsAt: Date;
          pastDueAt: Date;
        })[],
        now,
        headers,
        stats,
      });

      afterId = pastDueSubscriptions[pastDueSubscriptions.length - 1]?.id ?? afterId;
    }
  }

  return { stats };
}

async function processBatch(params: {
  authority: TenantAuthority;
  subscriptions: (SubscriptionRecord & { gracePeriodEndsAt: Date; pastDueAt: Date })[];
  now: Date;
  headers: Headers;
  stats: DunningCronStats;
}) {
  const { authority, subscriptions, now, headers, stats } = params;
  await forEachInOrder(subscriptions, async sub => {
    if (!sub.gracePeriodEndsAt || !sub.pastDueAt) return;
    try {
      await processDunningSubscription({ authority, sub, now, headers, stats });
    } catch {
      stats.errors++;
    }
  });
}

// `sub` was selected under `authority` with a tenant predicate, so it belongs to that tenant.
async function processDunningSubscription(params: {
  authority: TenantAuthority;
  sub: SubscriptionRecord & { gracePeriodEndsAt: Date; pastDueAt: Date };
  now: Date;
  headers: Headers;
  stats: DunningCronStats;
}) {
  const { authority, sub, now, headers, stats } = params;
  const daysRemaining = calculateDaysDiff(sub.gracePeriodEndsAt, now);
  const daysSinceFailed = calculateDaysDiff(now, sub.pastDueAt);

  const emailType = determineDunningEmailType(daysRemaining, daysSinceFailed);
  if (!emailType) return;

  const userRecord = await withTenantAuthority(authority, tx =>
    tx.query.user.findFirst({
      where: and(eq(user.id, sub.userId), eq(user.tenantId, sub.tenantId)),
    })
  );

  if (!userRecord?.email) return;

  await sendDunningEmail({
    email: userRecord.email,
    userName: userRecord.name,
    sub,
    daysRemaining,
    emailType,
  });

  if (emailType === 'day7') stats.day7Sent++;
  else if (emailType === 'day13') stats.day13Sent++;

  await withTenantAuthority(authority, async tx => {
    await tx
      .update(subscriptions)
      .set({ lastDunningAt: now })
      .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.tenantId, sub.tenantId)));
  });

  await logAuditEvent({
    actorId: null,
    actorRole: 'system',
    authority,
    action: emailType === 'day7' ? 'email.dunning.reminder' : 'email.dunning.final_warning',
    entityType: 'subscription',
    entityId: sub.id,
    metadata: {
      emailToSend: emailType,
      daysRemaining,
      daysSinceFailed,
    },
    headers,
  });
}

function calculateDaysDiff(dateA: Date, dateB: Date): number {
  const ms = dateA.getTime() - dateB.getTime();
  return ms > 0 ? Math.ceil(ms / (1000 * 60 * 60 * 24)) : Math.floor(ms / (1000 * 60 * 60 * 24));
}

function determineDunningEmailType(
  daysRemaining: number,
  daysSinceFailed: number
): 'day7' | 'day13' | null {
  if (daysRemaining >= 6 && daysRemaining <= 8 && daysSinceFailed >= 6 && daysSinceFailed <= 8) {
    return 'day7';
  }
  if (daysRemaining >= 0 && daysRemaining <= 2 && daysSinceFailed >= 12) {
    return 'day13';
  }
  return null;
}

async function sendDunningEmail(params: {
  email: string;
  userName: string | null;
  sub: SubscriptionRecord & { gracePeriodEndsAt: Date };
  daysRemaining: number;
  emailType: 'day7' | 'day13';
}) {
  const { email, userName, sub, daysRemaining, emailType } = params;
  const emailParams = {
    memberName: userName || 'Member',
    planName: sub.planId || 'Membership',
    gracePeriodEndDate: sub.gracePeriodEndsAt.toLocaleDateString(),
    daysRemaining,
  };

  if (emailType === 'day7') {
    await sendPaymentReminderEmail(email, emailParams);
  } else if (emailType === 'day13') {
    await sendPaymentFinalWarningEmail(email, emailParams);
  }
}
