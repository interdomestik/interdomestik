import {
  agentClients,
  and,
  db,
  desc,
  eq,
  memberActivities,
  user,
  type TenantTransaction,
} from '@interdomestik/database';
import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { sql } from 'drizzle-orm';

import { activityActorOf, memberActivityReadScope, type ActivityActor } from './access';
import type { ActivitySession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

let memberActivitiesTableExists: Promise<boolean> | null = null;

async function hasMemberActivitiesTable(): Promise<boolean> {
  // Avoid triggering noisy production errors when a tenant DB is missing this optional table.
  // This can happen in production-like environments where the migration hasn't been applied yet.
  if (!memberActivitiesTableExists) {
    // db-access-guard: system-exempt -- reason: optional table-existence probe reads no tenant data
    memberActivitiesTableExists = db
      .execute(sql`SELECT to_regclass('public.member_activities') AS regclass`)
      .then(rows => {
        const first = rows[0] as unknown as {
          regclass?: string | null;
          to_regclass?: string | null;
        };
        return Boolean(first?.regclass ?? first?.to_regclass);
      })
      .catch(() => false);
  }
  return memberActivitiesTableExists;
}

function permissionDenied(): never {
  throw new Error('Permission denied');
}

/**
 * Whether the actor may read this member's activities, decided in the transaction that reads them.
 * An agent is admitted only by its active agent_clients row; the member's referring agent
 * (user.agentId) is no admission. The member row and the assignment are read FOR SHARE, so the
 * assignment the check saw cannot change before the feed read completes (R-17).
 */
async function assertReadAccess(
  tx: TenantTransaction,
  actor: ActivityActor,
  memberId: string
): Promise<void> {
  const scope = memberActivityReadScope(actor.role);
  if (scope === 'own') {
    if (actor.userId !== memberId) permissionDenied();
    return;
  }

  const [member] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, memberId), eq(user.tenantId, actor.tenantId)))
    .for('share');
  if (!member) permissionDenied();
  if (scope === 'tenant') return;

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
  if (!assignment) permissionDenied();
}

export async function getMemberActivitiesCore(params: {
  session: ActivitySession | null;
  authority: TenantAuthority | null;
  memberId: string;
}) {
  const { session, authority, memberId } = params;

  if (!session) {
    throw new Error('Unauthorized');
  }
  if (!session.user.tenantId) {
    throw new Error('Missing tenantId');
  }
  if (!authority) throw new Error('Unauthorized');

  // The actor is the authority's principal; deny by default before the table probe or any read.
  const actor = activityActorOf(session, authority);
  if (!actor) throw new Error('Unauthorized');
  const scope = memberActivityReadScope(actor.role);
  if (scope === 'denied' || (scope === 'own' && actor.userId !== memberId)) {
    permissionDenied();
  }

  // Unchanged probe (pinned by the tenant guard): a missing optional table is an empty feed.
  if (!(await hasMemberActivitiesTable())) {
    return [];
  }

  return withTenantAuthority(authority, async tx => {
    await assertReadAccess(tx, actor, memberId);
    return tx.query.memberActivities.findMany({
      where: and(
        eq(memberActivities.memberId, memberId),
        eq(memberActivities.tenantId, actor.tenantId)
      ),
      orderBy: [desc(memberActivities.occurredAt)],
      with: {
        agent: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}
