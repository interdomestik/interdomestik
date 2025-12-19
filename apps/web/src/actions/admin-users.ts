'use server';

import { auth } from '@/lib/auth';
import { db, eq, user } from '@interdomestik/database';
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
    await db.update(user).set({ agentId }).where(eq(user.id, userId));

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to update user agent:', error);
    return { error: 'Failed to update user agent' };
  }
}

export async function getUsers() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  // Fetch users with their assigned agent
  // Since we need joined data, we use query
  const users = await db.query.user.findMany({
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    with: {
      agent: true,
    },
  });

  return users;
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
