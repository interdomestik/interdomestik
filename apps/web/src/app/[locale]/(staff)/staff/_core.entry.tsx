import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { LegacyBanner } from '@/components/dashboard/legacy-banner';
import { AuthenticatedShell } from '@/components/shell/authenticated-shell';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { StaffSidebar } from '@/components/staff/staff-sidebar';
import { BASE_NAMESPACES, STAFF_NAMESPACES, pickMessages } from '@/i18n/messages';
import { hasEffectiveRole } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { notFound } from 'next/navigation';
import { getMessages, setRequestLocale } from 'next-intl/server';

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

  // Vercel Best Practice: Eliminate Waterfall (async-parallel)
  // Fetch session and messages in parallel
  const [session, allMessages] = await Promise.all([
    getSessionSafe('StaffLayout'),
    getMessages({ locale }),
  ]);
  const sessionNonNull = requireSessionOrRedirect(session, locale);
  const [isStaff, isBranchManager] = await Promise.all([
    hasEffectiveRole({ session: sessionNonNull as unknown as UserSession, role: 'staff' }),
    hasEffectiveRole({ session: sessionNonNull as unknown as UserSession, role: 'branch_manager' }),
  ]);
  if (!isStaff && !isBranchManager) {
    notFound();
  }

  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, STAFF_NAMESPACES),
  };

  return (
    <AuthenticatedShell locale={locale} messages={messages}>
      <SidebarProvider defaultOpen={true}>
        <StaffSidebar />
        <SidebarInset className="bg-mesh flex flex-col min-h-screen">
          <DashboardHeader />
          <div className="px-6 pt-4 md:px-8">
            <LegacyBanner />
          </div>
          <main className="flex-1 p-6 md:p-8 pt-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </AuthenticatedShell>
  );
}
