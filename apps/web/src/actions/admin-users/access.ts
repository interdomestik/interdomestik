import type { Session } from './context';

export function requireAdminSession(session: NonNullable<Session> | null): NonNullable<Session> {
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return session;
}
