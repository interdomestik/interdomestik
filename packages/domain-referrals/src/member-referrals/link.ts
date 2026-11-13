import { user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

import type { ActionResult, MemberReferralLink, MemberReferralSession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getMemberReferralLinkCore(params: {
  appOrigin: string;
  session: MemberReferralSession | null;
  authority: TenantAuthority | null;
}): Promise<ActionResult<MemberReferralLink>> {
  const { session, authority } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  // SECURITY: Tenant scoping comes from the request's tenant authority
  if (!authority) {
    return { success: false, error: 'Missing tenant context' };
  }
  const { tenantId } = readTenantAuthority(authority);

  try {
    // SECURITY: Query scoped to tenant + user
    const member = await withTenantAuthority(authority, tx =>
      tx.query.user.findFirst({
        where: and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)),
        columns: {
          referralCode: true,
          name: true,
        },
      })
    );

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
      await withTenantAuthority(authority, tx =>
        tx
          .update(user)
          .set({ referralCode: code })
          .where(and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)))
      );
    }

    const baseUrl = params.appOrigin;
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
