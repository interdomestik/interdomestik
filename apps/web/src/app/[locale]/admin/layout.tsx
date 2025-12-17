import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { headers } from 'next/headers';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  // Enforce Admin Role
  if (session.user.role !== 'admin') {
    redirect({ href: '/dashboard', locale });
    return null;
  }

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
