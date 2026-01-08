import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

import type { ActionResult, MemberReferralLink, MemberReferralSession } from './types';

export async function getMemberReferralLinkCore(params: {
  session: MemberReferralSession | null;
}): Promise<ActionResult<MemberReferralLink>> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  // SECURITY: Tenant scoping
  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return { success: false, error: 'Missing tenant context' };
  }

  try {
    // SECURITY: Query scoped to tenant + user
    const member = await db.query.user.findFirst({
      where: and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)),
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
            .replaceAll(/[^A-Z]/g, '')
            .slice(0, 4)
        : 'USER';

      const randomPart = nanoid();
      code = `${namePart}-${randomPart}`;

      // SECURITY: Update scoped to tenant + user
      await db
        .update(user)
        .set({ referralCode: code })
        .where(and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)));
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
