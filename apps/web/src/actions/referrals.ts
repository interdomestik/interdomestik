'use server';

import { auth } from '@/lib/auth';
import { db, user } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';

export interface ReferralLinkResult {
  code: string;
  link: string;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Get or create a referral link for the current agent.
 * If the agent doesn't have a referral code, one is generated.
 */
export async function getAgentReferralLink(): Promise<ActionResult<ReferralLinkResult>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (session.user.role !== 'agent') {
    return { success: false, error: 'Access denied' };
  }

  try {
    // 1. Check if user already has a referral code
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        referralCode: true,
      },
    });

    let code = existingUser?.referralCode;

    // 2. If not, generate and save one
    if (!code) {
      // transform "John Doe" -> "JOHN"
      const namePart = session.user.name
        ? session.user.name
            .split(' ')[0]
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
        : 'AGENT';

      const randomPart = nanoid(6).toUpperCase();
      code = `${namePart}-${randomPart}`;

      await db.update(user).set({ referralCode: code }).where(eq(user.id, session.user.id));
    }

    // 3. Construct the link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const link = `${baseUrl}?ref=${code}`;

    return {
      success: true,
      data: {
        code,
        link,
      },
    };
  } catch (error) {
    console.error('Error generating referral link:', error);
    return { success: false, error: 'Failed to generate referral link' };
  }
}
