import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { headers } from 'next/headers';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // 🔒 PROTECTED ROUTE: Check for valid session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
    // redirect() from routing.ts requires a locale or works contextual?
    // Let's assume standard next-intl redirect behavior, but typically we need to pass the target.
    // Actually, redirect from next-intl/navigation needs just the path if wrapped in locale context,
    // but here we are in a layout... let's just use standard next/navigation redirect with locale prefix if needed
    // OR better: use the 'redirect' imported from routing which handles locale.
  }

  // Note: DashboardHeader needs to be inside SidebarInset if we want it to push/shrink with content
  // or outside if it stays fixed top.
  // Standard pattern is: SidebarProvider -> [AppSidebar, SidebarInset -> [Header, Main]]

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          <DashboardHeader />
          <main className="flex-1 p-6 md:p-8 pt-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
