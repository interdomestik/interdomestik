import type { UserSession } from '../types';

export function requireAdminSession(session: UserSession | null): UserSession {
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return session;
}
