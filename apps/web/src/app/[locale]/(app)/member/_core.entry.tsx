import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { APP_NAMESPACES, pickMessages } from '@/i18n/messages';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // 🔒 PROTECTED ROUTE: Check for valid session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (process.env.PLAYWRIGHT === '1' || process.env.INTERDOMESTIK_AUTOMATED === '1') {
    console.log('[E2E Debug] Member Layout Session:', {
      hasSession: !!session,
      userId: session?.user?.id,
      role: session?.user?.role,
      path: `/${locale}/member`,
    });
  }

  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  const role = session.user.role;
  // V3 Change: Agents are allowed in member layout.
  // if (role === 'agent') { redirect({ href: '/agent', locale }); return null; }

  if (role === 'staff') {
    redirect({ href: '/staff', locale });
    return null;
  }
  if (role === 'admin') {
    redirect({ href: '/admin', locale });
    return null;
  }

  // Load app-specific messages for client components
  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, APP_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <div data-testid="dashboard-page-ready">
        <SidebarProvider defaultOpen={true}>
          <DashboardSidebar />
          <SidebarInset className="bg-mesh flex flex-col min-h-screen">
            <DashboardHeader />
            <main className="flex-1 p-6 md:p-8 pt-6">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </NextIntlClientProvider>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
