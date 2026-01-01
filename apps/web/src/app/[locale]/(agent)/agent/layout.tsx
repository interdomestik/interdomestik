import { AgentSidebar } from '@/components/agent/agent-sidebar';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { AGENT_NAMESPACES, pickMessages } from '@/i18n/messages';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  // Only agents can access this portal
  if (session.user.role !== 'agent') {
    // Redirect non-agents to their appropriate portal
    if (session.user.role === 'admin') {
      redirect({ href: '/admin', locale });
    } else if (session.user.role === 'staff') {
      redirect({ href: '/staff', locale });
    } else {
      redirect({ href: '/member', locale });
    }
    return null;
  }

  // Load agent-specific messages for client components
  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, AGENT_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <SidebarProvider defaultOpen={true}>
        <AgentSidebar />
        <SidebarInset className="bg-mesh flex flex-col min-h-screen">
          <DashboardHeader />
          <div className="flex-1 p-6 md:p-8 pt-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
