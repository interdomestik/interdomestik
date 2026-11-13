import { user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult, ReferralLinkResult, ReferralSession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getAgentReferralLinkCore(params: {
  appOrigin: string;
  session: ReferralSession | null;
  authority: TenantAuthority | null;
}): Promise<ActionResult<ReferralLinkResult>> {
  const { session, authority } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized', data: undefined, fieldErrors: undefined };
  }

  if (session.user.role !== 'agent') {
    return { success: false, error: 'Access denied', data: undefined, fieldErrors: undefined };
  }

  // SECURITY: Tenant scoping comes from the request's tenant authority
  if (!authority) {
    return {
      success: false,
      error: 'Missing tenant context',
      data: undefined,
      fieldErrors: undefined,
    };
  }

  const { tenantId } = readTenantAuthority(authority);

  try {
    // SECURITY: Query scoped to tenant + user
    const existingUser = await withTenantAuthority(authority, tx =>
      tx.query.user.findFirst({
        where: and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)),
        columns: { referralCode: true },
      })
    );

    let code = existingUser?.referralCode;

    if (!code) {
      const namePart = session.user.name
        ? session.user.name
            .split(' ')[0]
            .toUpperCase()
            .replaceAll(/[^A-Z]/g, '')
        : 'AGENT';

      const randomPart = nanoid(6).toUpperCase();
      code = `${namePart}-${randomPart}`;

      // SECURITY: Update scoped to tenant + user
      await withTenantAuthority(authority, tx =>
        tx
          .update(user)
          .set({ referralCode: code })
          .where(and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)))
      );
    }

    return {
      success: true,
      data: {
        code,
        link: `${params.appOrigin}?ref=${code}`,
      },
      error: undefined,
      fieldErrors: undefined,
    };
  } catch (error) {
    console.error('Error generating referral link:', error);
    return {
      success: false,
      error: 'Failed to generate referral link',
      data: undefined,
      fieldErrors: undefined,
    };
  }
}
