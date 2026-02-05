import { LegacyBanner } from '@/components/dashboard/legacy-banner';
import { APP_NAMESPACES, pickMessages } from '@/i18n/messages';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default async function LegacyMemberLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, APP_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <div className="min-h-screen bg-mesh" data-testid="legacy-member-page-ready">
        <div className="px-6 pt-4 md:px-8">
          <LegacyBanner />
        </div>
        <main className="p-6 md:p-8 pt-6">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
