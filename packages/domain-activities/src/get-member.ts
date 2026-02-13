import { db, desc, eq, memberActivities } from '@interdomestik/database';
import { sql } from 'drizzle-orm';

import type { ActivitySession } from './types';

let memberActivitiesTableExists: Promise<boolean> | null = null;

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

export async function getMemberActivitiesCore(params: {
  session: ActivitySession | null;
  memberId: string;
}) {
  const { session, memberId } = params;

  if (!session) {
    throw new Error('Unauthorized');
  }

  if (session.user.role === 'member' && session.user.id !== memberId) {
    throw new Error('Permission denied');
  }

  try {
    if (!(await hasMemberActivitiesTable())) {
      return [];
    }

    const activities = await db.query.memberActivities.findMany({
      where: eq(memberActivities.memberId, memberId),
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
    return activities;
  } catch (error) {
    // Activities are non-critical for pilot flows; avoid polluting production error logs.
    console.warn('Failed to fetch activities:', error);
    return [];
  }
}
