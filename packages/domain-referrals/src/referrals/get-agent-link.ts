import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult, ReferralLinkResult, ReferralSession } from './types';

function buildReferralLink(code: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}?ref=${code}`;
}

export async function getAgentReferralLinkCore(params: {
  session: ReferralSession | null;
}): Promise<ActionResult<ReferralLinkResult>> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized', data: undefined, fieldErrors: undefined };
  }

  if (session.user.role !== 'agent') {
    return { success: false, error: 'Access denied', data: undefined, fieldErrors: undefined };
  }

  // SECURITY: Tenant scoping
  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return {
      success: false,
      error: 'Missing tenant context',
      data: undefined,
      fieldErrors: undefined,
    };
  }

  try {
    // SECURITY: Query scoped to tenant + user
    const existingUser = await db.query.user.findFirst({
      where: and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)),
      columns: { referralCode: true },
    });

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
      await db
        .update(user)
        .set({ referralCode: code })
        .where(and(eq(user.id, session.user.id), eq(user.tenantId, tenantId)));
    }

    return {
      success: true,
      data: {
        code,
        link: buildReferralLink(code),
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
