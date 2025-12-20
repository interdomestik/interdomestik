import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { ADMIN_NAMESPACES, BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
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
  if (session!.user.role !== 'admin') {
    const fallback = session!.user.role === 'agent' ? '/agent' : '/dashboard';
    redirect({ href: fallback, locale });
  }

  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, ADMIN_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <div className="flex min-h-screen">
        <AdminSidebar
          className="w-64 hidden md:flex"
          user={{
            name: session!.user.name || 'Admin',
            email: session!.user.email,
            role: session!.user.role,
          }}
        />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="container mx-auto p-8">{children}</div>
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
