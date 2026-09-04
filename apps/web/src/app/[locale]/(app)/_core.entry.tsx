import { APP_NAMESPACES, BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { getCachedSession } from '@/lib/auth.server';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppProtectedLayout({ children, params }: Readonly<Props>) {
  const { locale } = await params;

  // Enforce authentication for all routes in the (app) group
  const session = await getCachedSession();

  if (!session) {
    redirect(`/${locale}/login`);
  }

  setRequestLocale(locale);
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
