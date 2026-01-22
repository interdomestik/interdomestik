import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { StaffSidebar } from '@/components/staff/staff-sidebar';
import { BASE_NAMESPACES, STAFF_NAMESPACES, pickMessages } from '@/i18n/messages';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default async function StaffLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
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

  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    // Strict Isolation: 404 for everyone else
    const { notFound } = await import('next/navigation');
    notFound();
  }

  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, STAFF_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {/* E2E contract: ensureAuthenticated waits for dashboard-page-ready across all portals */}
      <div data-testid="dashboard-page-ready">
        <SidebarProvider defaultOpen={true}>
          <StaffSidebar />
          <SidebarInset className="bg-mesh flex flex-col min-h-screen">
            <DashboardHeader />
            <main className="flex-1 p-6 md:p-8 pt-6">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </NextIntlClientProvider>
  );
}
