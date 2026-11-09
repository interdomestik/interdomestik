import { logAuditEvent } from '@/lib/audit';
import { getDayWindow } from '@/lib/cron/engagement-schedule';
import { sendNpsSurveyEmail } from '@/lib/email';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { npsSurveyTokens } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import {
  authorityForTenant,
  createPendingEngagementSend,
  loadScheduledAuthorities,
  updateEngagementSend,
} from '../_engagement-email-sends';
import { selectActiveSubscriptionMembers } from '../_scheduled-members';

const NPS_TEMPLATE_KEY = 'nps_v1';
const NPS_DAYS_SINCE_SUB_CREATED = 45;
const TOKEN_TTL_DAYS = 30;

export type NpsCronResults = {
  sent: number;
  skipped: number;
  errors: number;
};

export async function runNpsCronCore(args: {
  ingress: IngressCapability<'cron'>;
  now: Date;
  headers: Headers;
}): Promise<NpsCronResults> {
  const { ingress, now, headers } = args;

  const results: NpsCronResults = {
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const { start, end } = getDayWindow(now, NPS_DAYS_SINCE_SUB_CREATED);

  // Each member is processed under the scheduled-work authority of its own tenant.
  const authorities = await loadScheduledAuthorities(ingress);

  const members = await selectActiveSubscriptionMembers({
    ingress,
    limit: 200,
    createdBetween: { start, end },
  });

  // Process members in parallel chunks or sequential loop
  for (const member of members) {
    const authority = authorityForTenant(authorities, member.tenantId);
    const status = await processNpsMember({
      member,
      authority,
      now,
      headers,
    });
    results[status]++;
  }

  return results;
}

// Extracted helper to reduce cognitive complexity
async function processNpsMember(args: {
  member: {
    userId: string | null;
    subId: string;
    tenantId: string | null;
    name: string | null;
    email: string | null;
  };
  authority: TenantAuthority | null;
  now: Date;
  headers: Headers;
}): Promise<'sent' | 'skipped' | 'errors'> {
  const { member, authority, now, headers } = args;
  const dedupeKey = `engagement:${member.subId}:${NPS_TEMPLATE_KEY}`;

  if (!authority || !member.userId) return 'skipped';
  const { tenantId } = readTenantAuthority(authority);
  const userId = member.userId;

  const inserted = await createPendingEngagementSend({
    authority,
    userId,
    subscriptionId: member.subId,
    templateKey: NPS_TEMPLATE_KEY,
    dedupeKey,
    metadata: {
      scheduledDays: NPS_DAYS_SINCE_SUB_CREATED,
    },
  });

  if (inserted.length === 0) return 'skipped'; // Already processed

  if (!member.email || !member.name) {
    await updateEngagementSend(authority, dedupeKey, {
      status: 'skipped',
      error: 'Missing recipient email or name',
    });
    return 'skipped';
  }

  const token = nanoid(32);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [tokenRow] = await withTenantAuthority(authority, async tx => {
    await tx
      .insert(npsSurveyTokens)
      .values({
        id: nanoid(),
        tenantId,
        userId,
        subscriptionId: member.subId,
        dedupeKey,
        token,
        createdAt: new Date(),
        expiresAt,
        usedAt: null,
        metadata: {
          templateKey: NPS_TEMPLATE_KEY,
        },
      })
      .onConflictDoNothing({ target: npsSurveyTokens.dedupeKey });

    return tx
      .select({ token: npsSurveyTokens.token })
      .from(npsSurveyTokens)
      .where(and(eq(npsSurveyTokens.dedupeKey, dedupeKey), eq(npsSurveyTokens.tenantId, tenantId)))
      .limit(1);
  });

  const surveyToken = tokenRow?.token;
  if (!surveyToken) {
    await updateEngagementSend(authority, dedupeKey, {
      status: 'error',
      error: 'Failed to create NPS token',
    });
    return 'errors';
  }

  try {
    const sendResult = await sendNpsSurveyEmail(member.email, {
      name: member.name,
      token: surveyToken,
    });

    if (sendResult.success) {
      await updateEngagementSend(authority, dedupeKey, {
        status: 'sent',
        providerMessageId: sendResult.id || null,
        sentAt: new Date(),
      });

      await logAuditEvent({
        actorId: null,
        actorRole: 'system',
        authority,
        action: 'email.nps.sent',
        entityType: 'subscription',
        entityId: member.subId,
        metadata: { templateKey: NPS_TEMPLATE_KEY },
        headers,
      });
      return 'sent';
    } else {
      const err = sendResult.error || 'Unknown error';
      // If "Resend not configured" (e.g. dev mode suppression), count as skipped
      const isSkipped = ['Resend not configured', 'email_suppressed'].includes(err);
      const status = isSkipped ? 'skipped' : 'error';

      await updateEngagementSend(authority, dedupeKey, {
        status,
        error: err,
      });

      await logAuditEvent({
        actorId: null,
        actorRole: 'system',
        authority,
        action: 'email.nps.failed',
        entityType: 'subscription',
        entityId: member.subId,
        metadata: { templateKey: NPS_TEMPLATE_KEY, error: err },
        headers,
      });
      return isSkipped ? 'skipped' : 'errors';
    }
  } catch {
    await updateEngagementSend(authority, dedupeKey, {
      status: 'error',
      error: 'Unhandled exception during send',
    });
    return 'errors';
  }
}
