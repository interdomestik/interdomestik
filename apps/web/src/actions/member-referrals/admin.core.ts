import { z } from 'zod';

import {
  listMemberReferralRewardsCore as listMemberReferralRewardsDomain,
  updateMemberReferralRewardStatusCore as updateMemberReferralRewardStatusDomain,
} from '@interdomestik/domain-referrals/member-referrals/admin';
import { requireTenantAdminSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';
import { revalidatePath } from 'next/cache';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';

import type { Session } from './context';

const listSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

const updateStatusSchema = z
  .object({
    rewardId: z.string().min(1),
    newStatus: z.enum(['pending', 'approved', 'credited', 'paid', 'void']),
  })
  .strict();

export async function listMemberReferralRewardsAdminCore(params: {
  session: Session | null;
  filters?: unknown;
}) {
  await requireTenantAdminSession(params.session as UserSession | null);

  const tenantId = params.session?.user?.tenantId;
  if (!tenantId) {
    return { success: false as const, error: 'Missing tenant context' };
  }

  const parsed = listSchema.safeParse(params.filters ?? {});
  if (!parsed.success) {
    return { success: false as const, error: 'Validation failed' };
  }

  return listMemberReferralRewardsDomain({
    tenantId,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });
}

export async function updateMemberReferralRewardStatusAdminCore(params: {
  session: Session | null;
  requestHeaders?: Headers;
  rewardId: string;
  newStatus: 'pending' | 'approved' | 'credited' | 'paid' | 'void';
}) {
  await requireTenantAdminSession(params.session as UserSession | null);

  const tenantId = params.session?.user?.tenantId;
  if (!tenantId) {
    return { success: false as const, error: 'Missing tenant context' };
  }

  const parsed = updateStatusSchema.safeParse({
    rewardId: params.rewardId,
    newStatus: params.newStatus,
  });
  if (!parsed.success) {
    return { success: false as const, error: 'Validation failed' };
  }

  const limit = await enforceRateLimitForAction({
    name: `action:member-referral-reward-status:${params.session?.user?.id ?? 'anonymous'}`,
    limit: 20,
    windowSeconds: 60,
    headers: params.requestHeaders ?? new Headers(),
    productionSensitive: true,
  });
  if (limit.limited) {
    return { success: false as const, error: 'Too many requests. Please wait a moment.' };
  }

  const result = await updateMemberReferralRewardStatusDomain({
    tenantId,
    rewardId: parsed.data.rewardId,
    newStatus: parsed.data.newStatus,
  });

  if (result.success) {
    revalidatePath('/admin/commissions');
    revalidatePath('/member/referrals');
    await logAuditEvent({
      actorId: params.session?.user?.id ?? null,
      actorRole: params.session?.user?.role ?? null,
      tenantId,
      action: 'referral.reward_status_updated',
      entityType: 'referral_reward',
      entityId: parsed.data.rewardId,
      metadata: { newStatus: parsed.data.newStatus },
    });
  }

  return result;
}
