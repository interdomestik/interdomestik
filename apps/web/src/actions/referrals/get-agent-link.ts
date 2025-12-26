import { db, user } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { Session } from './context';
import type { ActionResult, ReferralLinkResult } from './types';

function buildReferralLink(code: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}?ref=${code}`;
}

export async function getAgentReferralLinkCore(params: {
  session: Session | null;
}): Promise<ActionResult<ReferralLinkResult>> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (session.user.role !== 'agent') {
    return { success: false, error: 'Access denied' };
  }

  try {
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: { referralCode: true },
    });

    let code = existingUser?.referralCode;

    if (!code) {
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

    return {
      success: true,
      data: {
        code,
        link: buildReferralLink(code),
      },
      error: undefined,
    };
  } catch (error) {
    console.error('Error generating referral link:', error);
    return { success: false, error: 'Failed to generate referral link' };
  }
}
