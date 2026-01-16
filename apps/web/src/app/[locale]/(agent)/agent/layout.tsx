import { AgentSidebar } from '@/components/agent/agent-sidebar';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { AGENT_NAMESPACES, pickMessages } from '@/i18n/messages';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

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
    // Redirect non-agents to their appropriate portal
    if (session.user.role === 'admin') {
      redirect(`/${locale}/admin`);
    } else if (session.user.role === 'staff') {
      redirect(`/${locale}/staff`);
    } else {
      redirect(`/${locale}/member`);
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
