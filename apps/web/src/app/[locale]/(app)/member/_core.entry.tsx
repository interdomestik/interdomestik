import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { LegacyBanner } from '@/components/dashboard/legacy-banner';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { APP_NAMESPACES, pickMessages } from '@/i18n/messages';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

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
  const session = await getSessionSafe('MemberLayout');
  const sessionNonNull = requireSessionOrRedirect(session, locale);

  if (process.env.PLAYWRIGHT === '1' || process.env.INTERDOMESTIK_AUTOMATED === '1') {
    console.log('[E2E Debug] Member Layout Session:', {
      hasSession: !!sessionNonNull,
      userId: sessionNonNull?.user?.id,
      role: sessionNonNull?.user?.role,
      path: `/${locale}/member`,
    });
  }

  const role = sessionNonNull.user.role;
  const canonical = getCanonicalRouteForRole(role, locale);
  if (canonical && role !== 'member' && role !== 'user') {
    redirect(canonical);
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
            <div className="px-6 pt-4 md:px-8">
              <LegacyBanner />
            </div>
            <main className="flex-1 p-6 md:p-8 pt-6">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </NextIntlClientProvider>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
