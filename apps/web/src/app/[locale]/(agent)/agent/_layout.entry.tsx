import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { AuthenticatedShell } from '@/components/shell/authenticated-shell';
import { toClientShellUser } from '@/components/shell/client-shell-user';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { AGENT_NAMESPACES, pickMessages } from '@/i18n/messages';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
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

  const agentTier = sessionNonNull.user.id
    ? await getAgentTier({
        agentId: sessionNonNull.user.id,
        tenantId: sessionNonNull.user.tenantId,
      })
    : 'standard';
  const shellUser = toClientShellUser(sessionNonNull.user);

  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, AGENT_NAMESPACES);

  return (
    <div className="min-h-screen" data-testid="agent-page-ready">
      <AuthenticatedShell locale={locale} messages={messages}>
        <SidebarProvider defaultOpen={true}>
          <DashboardSidebar agentTier={agentTier} user={shellUser} adminAccess={false} />
          <SidebarInset className="bg-mesh flex flex-col min-h-screen">
            <DashboardHeader user={shellUser} adminAccess={false} />
            <div className="flex-1 p-6 md:p-8 pt-6">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </AuthenticatedShell>
    </div>
  );
}
