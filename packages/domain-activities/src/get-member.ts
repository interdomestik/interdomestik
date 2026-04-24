import { agentClients, and, db, desc, eq, memberActivities, user } from '@interdomestik/database';
import { sql } from 'drizzle-orm';

import type { ActivitySession } from './types';

let memberActivitiesTableExists: Promise<boolean> | null = null;
type TenantActivitySession = ActivitySession & {
  user: ActivitySession['user'] & { tenantId: string };
};

async function hasMemberActivitiesTable(): Promise<boolean> {
  // Avoid triggering noisy production errors when a tenant DB is missing this optional table.
  // This can happen in production-like environments where the migration hasn't been applied yet.
  if (!memberActivitiesTableExists) {
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

function assertReadableSession(
  session: ActivitySession | null,
  memberId: string
): asserts session is TenantActivitySession {
  if (!session) {
    throw new Error('Unauthorized');
  }

  if (!session.user.tenantId) {
    throw new Error('Missing tenantId');
  }

  if (session.user.role === 'member' && session.user.id !== memberId) {
    throw new Error('Permission denied');
  }
}

async function findTenantMember(memberId: string, tenantId: string) {
  return db.query.user.findFirst({
    where: and(eq(user.id, memberId), eq(user.tenantId, tenantId)),
    columns: {
      id: true,
      tenantId: true,
      agentId: true,
    },
  });
}

async function findActiveAgentAssignment(params: {
  agentId: string;
  memberId: string;
  tenantId: string;
}) {
  return db.query.agentClients.findFirst({
    where: and(
      eq(agentClients.tenantId, params.tenantId),
      eq(agentClients.agentId, params.agentId),
      eq(agentClients.memberId, params.memberId),
      eq(agentClients.status, 'active')
    ),
    columns: {
      id: true,
    },
  });
}

async function assertNonMemberReadAccess(session: TenantActivitySession, memberId: string) {
  if (session.user.role === 'member') {
    return;
  }

  const member = await findTenantMember(memberId, session.user.tenantId);
  if (!member) {
    throw new Error('Permission denied');
  }

  if (session.user.role !== 'agent' || member.agentId === session.user.id) {
    return;
  }

  const assignment = await findActiveAgentAssignment({
    agentId: session.user.id,
    memberId,
    tenantId: session.user.tenantId,
  });

  if (!assignment) {
    throw new Error('Permission denied');
  }
}

async function findMemberActivities(memberId: string, tenantId: string) {
  return db.query.memberActivities.findMany({
    where: and(eq(memberActivities.memberId, memberId), eq(memberActivities.tenantId, tenantId)),
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
}

export async function getMemberActivitiesCore(params: {
  session: ActivitySession | null;
  memberId: string;
}) {
  const { session, memberId } = params;

  assertReadableSession(session, memberId);

  try {
    if (!(await hasMemberActivitiesTable())) {
      return [];
    }

    await assertNonMemberReadAccess(session, memberId);
    return findMemberActivities(memberId, session.user.tenantId);
  } catch (error) {
    if (error instanceof Error && error.message === 'Permission denied') {
      throw error;
    }

    // Activities are non-critical for pilot flows; avoid polluting production error logs.
    console.warn('Failed to fetch activities:', error);
    return [];
  }
}
