import { db } from '@interdomestik/database/db';
import { user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

export async function activateAgentUserProfile(params: {
  currentRole: string;
  referralCode: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  const updatedRows = await db
    .update(user)
    .set({
      role: 'agent',
      referralCode: params.referralCode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(user.id, params.userId),
        eq(user.tenantId, params.tenantId),
        eq(user.role, params.currentRole)
      )
    )
    .returning({ id: user.id });

  if (updatedRows.length === 0) {
    throw new Error('Agent activation scope no longer matches the authenticated session');
  }
}
