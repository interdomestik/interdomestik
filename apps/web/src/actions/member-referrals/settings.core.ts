import { z } from 'zod';

import {
  getMemberReferralProgramSettingsCore as getMemberReferralProgramSettingsDomain,
  upsertMemberReferralProgramSettingsCore as upsertMemberReferralProgramSettingsDomain,
} from '@interdomestik/domain-referrals/member-referrals/settings';
import { requireTenantAdminSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';
import { revalidatePath } from 'next/cache';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';

import type { Session } from './context';

const settingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    rewardType: z.enum(['fixed', 'percent']).optional(),
    fixedRewardCents: z.number().int().min(0).nullable().optional(),
    percentRewardBps: z.number().int().min(0).max(10000).nullable().optional(),
    settlementMode: z.enum(['credit_only', 'credit_or_payout']).optional(),
    payoutThresholdCents: z.number().int().min(0).optional(),
    fraudReviewEnabled: z.boolean().optional(),
    currencyCode: z.string().trim().min(3).max(3).optional(),
    qualifyingEventType: z.enum(['first_paid_membership', 'renewal']).optional(),
  })
  .strict();

export async function getMemberReferralProgramSettingsCore(params: { session: Session | null }) {
  await requireTenantAdminSession(params.session as UserSession | null);

  const tenantId = params.session?.user?.tenantId;
  if (!tenantId) {
    return { success: false as const, error: 'Missing tenant context' };
  }

  return getMemberReferralProgramSettingsDomain({ tenantId });
}

export async function updateMemberReferralProgramSettingsCore(params: {
  session: Session | null;
  requestHeaders?: Headers;
  data: unknown;
}) {
  await requireTenantAdminSession(params.session as UserSession | null);

  const tenantId = params.session?.user?.tenantId;
  if (!tenantId) {
    return { success: false as const, error: 'Missing tenant context' };
  }

  const parsed = settingsSchema.safeParse(params.data);
  if (!parsed.success) {
    return { success: false as const, error: 'Validation failed' };
  }

  const limit = await enforceRateLimitForAction({
    name: `action:member-referral-settings-update:${params.session?.user?.id ?? 'anonymous'}`,
    limit: 10,
    windowSeconds: 60,
    headers: params.requestHeaders ?? new Headers(),
  });
  if (limit.limited) {
    return { success: false as const, error: 'Too many requests. Please wait a moment.' };
  }

  const result = await upsertMemberReferralProgramSettingsDomain({
    tenantId,
    settings: parsed.data,
  });

  if (result.success) {
    revalidatePath('/admin/commissions');
    await logAuditEvent({
      actorId: params.session?.user?.id ?? null,
      actorRole: params.session?.user?.role ?? null,
      tenantId,
      action: 'referral.settings_updated',
      entityType: 'referral_settings',
      metadata: {
        keys: Object.keys(parsed.data),
      },
    });
  }

  return result;
}
