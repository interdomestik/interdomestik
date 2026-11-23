import { agentClients, and, db, memberActivities, user } from '@interdomestik/database';
import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { activityActorOf, memberActivityWriteScope } from './access';
import { activitySchema, type LogActivityInput } from './schema';
import type { ActionResult, ActivitySession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type { LogActivityInput } from './schema';

const MEMBER_ACCESS_DENIED: ActionResult = { success: false, error: 'Member access denied' };

async function hasMemberActivitiesTable(): Promise<boolean> {
  // Keep this check local to avoid importing extra helpers and to prevent noisy prod errors
  // if the optional member_activities table hasn't been migrated yet.
  try {
    // db-access-guard: system-exempt -- reason: optional table-existence probe reads no tenant data
    const rows = await db.execute(`SELECT to_regclass('public.member_activities') AS regclass`);
    const first = rows[0] as unknown as { regclass?: string | null; to_regclass?: string | null };
    return Boolean(first?.regclass ?? first?.to_regclass);
  } catch {
    return false;
  }
}

export async function logActivityCore(params: {
  session: ActivitySession | null;
  authority: TenantAuthority | null;
  data: LogActivityInput;
}): Promise<ActionResult> {
  const { session, authority, data } = params;

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }
  if (!session.user.tenantId) {
    return { success: false, error: 'Missing tenantId' };
  }
  if (!authority) {
    return { success: false, error: 'Unauthorized' };
  }
  // The actor is the authority's principal; deny by default before any read or write.
  const actor = activityActorOf(session, authority);
  if (!actor) {
    return { success: false, error: 'Unauthorized' };
  }
  const scope = memberActivityWriteScope(actor.role);
  if (scope === 'denied') {
    return { success: false, error: 'Permission denied' };
  }

  const result = activitySchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: 'Validation failed' };
  }

  const { memberId, type, subject, description } = result.data;

  try {
    if (!(await hasMemberActivitiesTable())) {
      return { success: false, error: 'Activity log unavailable' };
    }

    // An agent is admitted only by its active agent_clients row; the member's referring agent
    // (user.agentId) is no admission. The member row and the assignment are read FOR SHARE in the
    // transaction that inserts the activity, so the access the check saw holds until the insert
    // commits (R-17).
    return await withTenantAuthority(authority, async tx => {
      const [member] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.id, memberId), eq(user.tenantId, actor.tenantId)))
        .for('share');
      if (!member) return MEMBER_ACCESS_DENIED;

      if (scope === 'assigned') {
        const [assignment] = await tx
          .select({ id: agentClients.id })
          .from(agentClients)
          .where(
            and(
              eq(agentClients.tenantId, actor.tenantId),
              eq(agentClients.agentId, actor.userId),
              eq(agentClients.memberId, memberId),
              eq(agentClients.status, 'active')
            )
          )
          .for('share');
        if (!assignment) return MEMBER_ACCESS_DENIED;
      }

      const now = new Date();
      await tx.insert(memberActivities).values({
        id: nanoid(),
        tenantId: actor.tenantId,
        agentId: actor.userId,
        memberId,
        type,
        subject,
        description,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true, error: undefined } satisfies ActionResult;
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
    return { success: false, error: 'Failed to log activity. Please try again.' };
  }
}
