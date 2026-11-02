import { agentClients, and, db, desc, eq, memberActivities, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { sql } from 'drizzle-orm';

import type { ActivitySession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

let memberActivitiesTableExists: Promise<boolean> | null = null;
type TenantActivitySession = ActivitySession & {
  user: ActivitySession['user'] & { tenantId: string };
};

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

async function findTenantMember(memberId: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    tx.query.user.findFirst({
      where: and(eq(user.id, memberId), eq(user.tenantId, tenantId)),
      columns: {
        id: true,
        tenantId: true,
        agentId: true,
      },
    })
  );
}

async function findActiveAgentAssignment(params: {
  agentId: string;
  memberId: string;
  authority: TenantAuthority;
}) {
  const { tenantId } = readTenantAuthority(params.authority);
  return withTenantAuthority(params.authority, tx =>
    tx.query.agentClients.findFirst({
      where: and(
        eq(agentClients.tenantId, tenantId),
        eq(agentClients.agentId, params.agentId),
        eq(agentClients.memberId, params.memberId),
        eq(agentClients.status, 'active')
      ),
      columns: {
        id: true,
      },
    })
  );
}

async function assertNonMemberReadAccess(
  session: TenantActivitySession,
  authority: TenantAuthority,
  memberId: string
) {
  if (session.user.role === 'member') {
    return;
  }

  const member = await findTenantMember(memberId, authority);
  if (!member) {
    throw new Error('Permission denied');
  }

  if (session.user.role !== 'agent' || member.agentId === session.user.id) {
    return;
  }

  const assignment = await findActiveAgentAssignment({
    agentId: session.user.id,
    memberId,
    authority,
  });

  if (!assignment) {
    throw new Error('Permission denied');
  }
}

async function findMemberActivities(memberId: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    tx.query.memberActivities.findMany({
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
    })
  );
}

export async function getMemberActivitiesCore(params: {
  session: ActivitySession | null;
  authority: TenantAuthority | null;
  memberId: string;
}) {
  const { session, authority, memberId } = params;

  assertReadableSession(session, memberId);
  if (!authority) throw new Error('Unauthorized');

  try {
    if (!(await hasMemberActivitiesTable())) {
      return [];
    }

    await assertNonMemberReadAccess(session, authority, memberId);
    return findMemberActivities(memberId, authority);
  } catch (error) {
    if (error instanceof Error && error.message === 'Permission denied') {
      throw error;
    }

    // Activities are non-critical for pilot flows; avoid polluting production error logs.
    console.warn('Failed to fetch activities:', error);
    return [];
  }
}
