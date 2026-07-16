import { dbAdmin } from '@interdomestik/database/db';
import { generateMemberNumberWithRetry } from '@interdomestik/database/member-number';

import { captureMemberNumberLifecycleEvent } from './member-number-observability';

type CreatedSession = { userId?: string | null };

export async function runMemberNumberSessionHook(session: CreatedSession): Promise<void> {
  if (!session.userId) return;

  try {
    const { user } = await import('@interdomestik/database/schema');
    const { eq } = await import('drizzle-orm');
    // db-access-guard: system-exempt -- reason: auth hook runs before tenant context exists
    const existing = await dbAdmin
      .select({
        role: user.role,
        memberNumber: user.memberNumber,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, session.userId))
      .limit(1);

    if (!existing[0] || existing[0].role !== 'member' || existing[0].memberNumber) return;
    const row = existing[0] as (typeof existing)[0] & { joinedAt?: Date | string };
    const dateSource = row.joinedAt ?? row.createdAt;
    if (!dateSource) throw new Error('Member year source unavailable');

    const joinedAt = new Date(dateSource);
    const createdYear = joinedAt.getFullYear();
    captureMemberNumberLifecycleEvent('self_heal_invoked', { createdYear });
    const result = await generateMemberNumberWithRetry(dbAdmin, {
      userId: session.userId,
      joinedAt,
    });
    captureMemberNumberLifecycleEvent('self_heal_resolved', {
      createdYear,
      isNew: result.isNew,
    });
  } catch {
    captureMemberNumberLifecycleEvent('self_heal_failed');
  }
}
