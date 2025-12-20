import { AGENT_NAMESPACES, BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { Link, redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AgentLayout({ children, params }: Props) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  // RBAC: Allow agent workspace (agent, staff, admin)
  if (
    session.user.role !== 'agent' &&
    session.user.role !== 'staff' &&
    session.user.role !== 'admin'
  ) {
    redirect({ href: '/dashboard', locale });
    return null;
  }

  const t = await getTranslations('agent');
  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, AGENT_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <div className="flex min-h-screen flex-col bg-muted/10">
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center">
            <div className="mr-4 hidden md:flex">
              <Link href="/" className="mr-6 flex items-center space-x-2">
                <span className="hidden font-bold sm:inline-block">
                  Interdomestik <span className="text-primary">{t('title')}</span>
                </span>
              </Link>
              <nav className="flex items-center space-x-6 text-sm font-medium">
                <Link
                  href="/agent"
                  className="transition-colors hover:text-foreground/80 text-foreground"
                >
                  {t('dashboard')}
                </Link>
                <Link
                  href="/agent/claims"
                  className="transition-colors hover:text-foreground/80 text-foreground/60"
                >
                  {t('claims')}
                </Link>
                <Link
                  href="/agent/users"
                  className="transition-colors hover:text-foreground/80 text-foreground/60"
                >
                  {t('members')}
                </Link>
              </nav>
            </div>
            <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
              <div className="w-full flex-1 md:w-auto md:flex-none">{/* Search placeholder */}</div>
              <div className="text-xs text-muted-foreground mr-4 text-right">
                <div>{session.user.email}</div>
                <div className="capitalize font-medium text-primary/80">{session.user.role}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 container py-6">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
