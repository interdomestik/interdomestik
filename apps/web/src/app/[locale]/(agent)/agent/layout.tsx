import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { LegacyBanner } from '@/components/dashboard/legacy-banner';
import { AuthenticatedShell } from '@/components/shell/authenticated-shell';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { AGENT_NAMESPACES, pickMessages } from '@/i18n/messages';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import { db } from '@interdomestik/database/db';
import { agentSettings } from '@interdomestik/database/schema';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { getMessages, setRequestLocale } from 'next-intl/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  // Fetch agent tier for RBAC Sidebar
  let agentTier = 'standard';
  if (sessionNonNull.user.id) {
    const settings = await db.query.agentSettings.findFirst({
      where: eq(agentSettings.agentId, sessionNonNull.user.id),
      columns: { tier: true },
    });
    if (settings?.tier) agentTier = settings.tier;
  }

  // Load agent-specific messages for client components
  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, AGENT_NAMESPACES);

  return (
    <AuthenticatedShell locale={locale} messages={messages}>
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar agentTier={agentTier} />
        <SidebarInset className="bg-mesh flex flex-col min-h-screen">
          <DashboardHeader />
          <div className="px-6 pt-4 md:px-8">
            <LegacyBanner />
          </div>
          <div className="flex-1 p-6 md:p-8 pt-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AuthenticatedShell>
  );
}
