import type { Session } from './context';

export function isAdmin(role: string): boolean {
  return role === 'admin';
}

export function canReadAgentSettings(params: {
  session: NonNullable<Session> | null;
  agentId: string;
}): boolean {
  const { session, agentId } = params;
  if (!session?.user) return false;
  return isAdmin(session.user.role) || session.user.id === agentId;
}
