import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { setRequestLocale } from 'next-intl/server';
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

  if (!session) {
    redirect({ href: '/login', locale });
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset className="bg-mesh flex flex-col min-h-screen">
        <DashboardHeader />
        <main className="flex-1 p-6 md:p-8 pt-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
