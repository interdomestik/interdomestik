import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { ADMIN_NAMESPACES, BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { Separator, SidebarInset, SidebarProvider, SidebarTrigger } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
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
    redirect({ href: '/auth/sign-in', locale });
  }

  // Strict Role Check
  console.log(
    '[AdminLayout] Checking access for:',
    session?.user?.email,
    'Role:',
    session?.user?.role
  );

  if (session!.user.role !== 'admin') {
    console.log('[AdminLayout] Access Denied. Redirecting to /member');
    const fallback = '/member';
    redirect({ href: fallback, locale });
  }

  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, ADMIN_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <SidebarProvider defaultOpen={true}>
        <AdminSidebar
          user={{
            name: session!.user.name || 'Admin',
            email: session!.user.email,
            role: session!.user.role,
          }}
        />
        <SidebarInset className="bg-mesh flex flex-col min-h-screen">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-md sticky top-0 z-30 px-6 transition-all">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
            </div>
            <div className="flex-1 flex items-center justify-between">
              <h1 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Admin Panel
              </h1>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="container mx-auto">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
