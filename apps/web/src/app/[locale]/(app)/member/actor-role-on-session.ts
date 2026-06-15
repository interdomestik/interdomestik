export function resolveMemberActorRoleOnSession(role: string | null | undefined): string | null {
  if (role === 'agent' || role === 'member' || role === 'user') {
    return 'member';
  }

  return role ?? null;
}

type SessionWithRole = {
  user?: ({ role?: string | null } & Record<string, unknown>) | null;
};

export function withMemberActorRoleOnSession<TSession extends SessionWithRole>(
  session: TSession
): TSession {
  const user = session.user;
  if (!user) return session;

  const actorRoleOnSession = resolveMemberActorRoleOnSession(user.role);
  if (actorRoleOnSession === user.role) return session;

  return {
    ...session,
    user: {
      ...user,
      role: actorRoleOnSession,
    },
  } as TSession;
}
