'use server';

import { auth } from '@/lib/auth';
import {
  agentClients,
  and,
  claimMessages,
  claims,
  db,
  eq,
  ilike,
  inArray,
  or,
  user,
} from '@interdomestik/database';
import { randomUUID } from 'crypto';
import { desc, isNotNull, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function updateUserAgent(userId: string, agentId: string | null) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  try {
    await db.transaction(async tx => {
      await tx.update(user).set({ agentId }).where(eq(user.id, userId));

      await tx
        .update(agentClients)
        .set({ status: 'inactive' })
        .where(eq(agentClients.memberId, userId));

      if (agentId) {
        await tx
          .insert(agentClients)
          .values({
            id: randomUUID(),
            agentId,
            memberId: userId,
            status: 'active',
            joinedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [agentClients.agentId, agentClients.memberId],
            set: { status: 'active', joinedAt: new Date() },
          });
      }
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to update user agent:', error);
    return { error: 'Failed to update user agent' };
  }
}

export async function getUsers(filters?: { search?: string; role?: string; assignment?: string }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  // Fetch users with their assigned agent
  // Since we need joined data, we use query
  const conditions: any[] = [];
  const roleFilter = filters?.role && filters.role !== 'all' ? filters.role : null;
  const assignmentFilter =
    filters?.assignment && filters.assignment !== 'all' ? filters.assignment : null;

  if (roleFilter) {
    if (roleFilter.includes(',')) {
      conditions.push(inArray(user.role, roleFilter.split(',')));
    } else {
      conditions.push(eq(user.role, roleFilter));
    }
  }

  if (assignmentFilter === 'assigned') {
    conditions.push(isNotNull(user.agentId));
  }

  if (assignmentFilter === 'unassigned') {
    conditions.push(isNull(user.agentId));
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(ilike(user.name, term), ilike(user.email, term)));
  }

  const users = await db.query.user.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    with: {
      agent: true,
    },
  });

  const unreadByUser = new Map<string, { count: number; claimId: string }>();

  if (session.user.role === 'admin') {
    const unreadConditions = [
      isNull(claimMessages.readAt),
      eq(claimMessages.senderId, claims.userId),
    ];

    const unreadRows = await db
      .select({
        userId: claims.userId,
        claimId: claims.id,
      })
      .from(claimMessages)
      .innerJoin(claims, eq(claimMessages.claimId, claims.id))
      .where(and(...unreadConditions))
      .orderBy(desc(claimMessages.createdAt));

    for (const row of unreadRows) {
      const existing = unreadByUser.get(row.userId);
      if (existing) {
        existing.count += 1;
      } else {
        unreadByUser.set(row.userId, { count: 1, claimId: row.claimId });
      }
    }
  }

  const alertBase = '/admin/claims/';

  return users.map(userRow => {
    const unread = unreadByUser.get(userRow.id);
    return {
      ...userRow,
      unreadCount: unread?.count ?? 0,
      unreadClaimId: unread?.claimId ?? null,
      alertLink: unread ? `${alertBase}${unread.claimId}` : null,
    };
  });
}

// Fetch available agents for dropdown
export async function getAgents() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  const agents = await db.query.user.findMany({
    where: eq(user.role, 'agent'),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return agents;
}

export async function getStaff() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  const staff = await db.query.user.findMany({
    where: inArray(user.role, ['staff', 'admin']),
    orderBy: (users, { asc }) => [asc(users.name)],
  });

  return staff;
}
