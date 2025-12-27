import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import type { ActionResult, MemberReferralLink, MemberReferralSession } from './types';

export async function getMemberReferralLinkCore(params: {
  session: MemberReferralSession | null;
}): Promise<ActionResult<MemberReferralLink>> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const member = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        referralCode: true,
        name: true,
      },
    });

    let code = member?.referralCode;

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
