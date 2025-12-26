import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { StaffSidebar } from '@/components/staff/staff-sidebar';
import { BASE_NAMESPACES, STAFF_NAMESPACES, pickMessages } from '@/i18n/messages';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { SidebarInset, SidebarProvider } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function StaffLayout({
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

  if (session.user.role !== 'staff') {
    if (session.user.role === 'admin') {
      redirect({ href: '/admin', locale });
    } else if (session.user.role === 'agent') {
      redirect({ href: '/agent', locale });
    } else {
      redirect({ href: '/member', locale });
    }
    return null;
  }

  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, STAFF_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <SidebarProvider defaultOpen={true}>
        <StaffSidebar />
        <SidebarInset className="bg-mesh flex flex-col min-h-screen">
          <DashboardHeader />
          <main className="flex-1 p-6 md:p-8 pt-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
