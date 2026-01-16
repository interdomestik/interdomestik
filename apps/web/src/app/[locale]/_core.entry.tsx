import { AxeProvider } from '@/components/accessibility/axe-provider';
import { AnalyticsScripts } from '@/components/analytics/analytics-scripts';
import { PwaRegistrar } from '@/components/pwa-registrar';

import { ReferralTracker } from '@/components/analytics/referral-tracker';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { routing } from '@/i18n/routing';
import '@interdomestik/ui/globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  // Guard against invalid locale segments (e.g. /index.html/metadata.json)
  // which can otherwise cause dynamic import failures.
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    return {
      title: {
        default: 'Interdomestik',
        template: `%s | Interdomestik`,
      },
      description: 'Consumer Protection Platform',
      keywords: ['consumer protection', 'claims', 'disputes', 'balkans', 'kosovo', 'albania'],
      authors: [{ name: 'Interdomestik' }],
      openGraph: {
        type: 'website',
        locale: 'en_US',
        siteName: 'Interdomestik',
      },
    };
  }

  const messages = (await import(`@/messages/${locale}/metadata.json`)).default;

  return {
    title: {
      default: messages.metadata?.title || 'Interdomestik',
      template: `%s | Interdomestik`,
    },
    description: messages.metadata?.description || 'Consumer Protection Platform',
    keywords: ['consumer protection', 'claims', 'disputes', 'balkans', 'kosovo', 'albania'],
    authors: [{ name: 'Interdomestik' }],
    openGraph: {
      type: 'website',
      locale: locale === 'sq' ? 'sq_AL' : 'en_US',
      siteName: 'Interdomestik',
    },
  };
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  const headersList = await headers();
  const nonce = headersList.get('x-nonce');

  // Ensure that the incoming locale is valid
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Fetch messages for the locale
  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, BASE_NAMESPACES);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {process.env.NODE_ENV === 'development' && <script src="http://localhost:8097"></script>}
        <Suspense>
          <PostHogProvider>
            <NextIntlClientProvider messages={messages} locale={locale}>
              <QueryProvider>
                {children}
                <Toaster position="top-right" richColors />
                <AxeProvider />
                <ReferralTracker />
                <PwaRegistrar />
                <AnalyticsScripts nonce={nonce} />
              </QueryProvider>
            </NextIntlClientProvider>
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}

export { generateViewport } from '@/app/_segment-exports';
