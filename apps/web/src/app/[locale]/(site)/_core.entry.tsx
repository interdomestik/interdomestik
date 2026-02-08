import { BASE_NAMESPACES, SITE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function SiteLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, SITE_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
