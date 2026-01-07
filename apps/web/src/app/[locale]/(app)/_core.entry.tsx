import { APP_NAMESPACES, BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { headers } from 'next/headers';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppProtectedLayout({ children, params }: Readonly<Props>) {
  const { locale } = await params;

  // Enforce authentication for all routes in the (app) group
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
  }

  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, APP_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}
