import { AgentRoleShell } from '@/components/shell/agent-role-shell';
import { AuthenticatedShell } from '@/components/shell/authenticated-shell';
import { toClientShellUser } from '@/components/shell/client-shell-user';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { AGENT_NAMESPACES, pickMessages } from '@/i18n/messages';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { getAgentTier } from './_layout.core';

export default async function AgentLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionSafe('AgentLayout');
  const sessionNonNull = requireSessionOrRedirect(session, locale);
  await requireEffectivePortalAccessOrNotFound(sessionNonNull, ['agent']);

  const authorized =
    sessionNonNull.user.id && sessionNonNull.user.tenantId ? await authorizeSessionTenant() : null;
  const agentTier = sessionNonNull.user.id
    ? await getAgentTier({
        agentId: sessionNonNull.user.id,
        authority: authorized?.authority ?? null,
      })
    : 'standard';
  const shellUser = toClientShellUser(sessionNonNull.user);

  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, AGENT_NAMESPACES);

  return (
    <div className="min-h-screen" data-testid="agent-page-ready">
      <AuthenticatedShell locale={locale} messages={messages}>
        <AgentRoleShell agentTier={agentTier} user={shellUser}>
          {children}
        </AgentRoleShell>
      </AuthenticatedShell>
    </div>
  );
}
