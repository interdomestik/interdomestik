'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { referrals, user } from '@interdomestik/database/schema';
import { count, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export interface MemberReferralLink {
  code: string;
  link: string;
  whatsappShareUrl: string;
}

export interface MemberReferralStats {
  totalReferred: number;
  pendingRewards: number;
  paidRewards: number;
  rewardsCurrency: string;
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Get or create a referral link for the current member.
 */
export async function getMemberReferralLink(): Promise<ActionResult<MemberReferralLink>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Check if user already has a referral code
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        referralCode: true,
        name: true,
      },
    });

    let code = existingUser?.referralCode;

    // Generate code if not exists
    if (!code) {
      const namePart = session.user.name
        ? session.user.name
            .split(' ')[0]
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .slice(0, 4)
        : 'USER';

      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      code = `${namePart}-${randomPart}`;

      await db.update(user).set({ referralCode: code }).where(eq(user.id, session.user.id));
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const link = `${baseUrl}?ref=${code}`;

    // Pre-fill WhatsApp message
    const whatsappMessage = encodeURIComponent(
      `Join Asistenca with my referral link and get protection for your family! ${link}`
    );
    const whatsappShareUrl = `https://wa.me/?text=${whatsappMessage}`;

    return {
      success: true,
      data: { code, link, whatsappShareUrl },
    };
  } catch (error) {
    console.error('Error generating member referral link:', error);
    return { success: false, error: 'Failed to generate referral link' };
  }
}

/**
 * Get referral statistics for the current member.
 */
export async function getMemberReferralStats(): Promise<ActionResult<MemberReferralStats>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Count total referrals
    const [totalResult] = await db
      .select({ count: count() })
      .from(referrals)
      .where(eq(referrals.referrerId, session.user.id));

    // Sum pending rewards (status = 'pending')
    const pendingReferrals = await db.query.referrals.findMany({
      where: eq(referrals.referrerId, session.user.id),
      columns: {
        status: true,
        referrerRewardCents: true,
      },
    });

    let pendingCents = 0;
    let paidCents = 0;

    for (const ref of pendingReferrals) {
      const amount = ref.referrerRewardCents || 0;
      if (ref.status === 'pending') {
        pendingCents += amount;
      } else if (ref.status === 'rewarded') {
        paidCents += amount;
      }
    }

    return {
      success: true,
      data: {
        totalReferred: totalResult?.count || 0,
        pendingRewards: pendingCents / 100,
        paidRewards: paidCents / 100,
        rewardsCurrency: 'EUR',
      },
    };
  } catch (error) {
    console.error('Error fetching member referral stats:', error);
    return { success: false, error: 'Failed to fetch referral stats' };
  }
}
