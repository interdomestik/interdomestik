import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { AGENT_NAMESPACES, pickMessages } from '@/i18n/messages';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { agentSettings } from '@interdomestik/database/schema';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

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

  const session = await (async () => {
    try {
      return await auth.api.getSession({
        headers: await headers(),
      });
    } catch {
      return null;
    }
  })();

  if (!session) {
    redirect(`/${locale}/login`);
    return null;
  }

  // Only agents can access this portal
  if (session.user.role !== 'agent') {
    // Strict Isolation: 404 for everyone else
    const { notFound } = await import('next/navigation');
    notFound();
  }

  // Fetch agent tier for RBAC Sidebar
  let agentTier = 'standard';
  if (session?.user?.id) {
    const settings = await db.query.agentSettings.findFirst({
      where: eq(agentSettings.agentId, session.user.id),
      columns: { tier: true },
    });
    if (settings?.tier) agentTier = settings.tier;
  }

  // Load agent-specific messages for client components
  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, AGENT_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {/* E2E contract: ensureAuthenticated waits for dashboard-page-ready across all portals */}
      <div data-testid="dashboard-page-ready">
        <SidebarProvider defaultOpen={true}>
          <DashboardSidebar agentTier={agentTier} />
          <SidebarInset className="bg-mesh flex flex-col min-h-screen">
            <DashboardHeader />
            <div className="flex-1 p-6 md:p-8 pt-6">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </NextIntlClientProvider>
  );
}
