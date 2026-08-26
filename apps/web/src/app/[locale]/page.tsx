import { BASE_NAMESPACES, HOME_NAMESPACES, pickMessages } from '@/i18n/messages';
import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';

// Vercel Best Practice: Direct Imports (bundle-barrel-imports)
// Avoid barrel files for heavy landing page components to improve tree-shaking
import { Footer } from './components/home/footer';
import { Header } from './components/home/header';
import { HomePageRuntime } from './components/home/home-page-runtime';
import { PricingSection } from './components/home/pricing-section';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

type Props = {
  params: Promise<{ locale: string }>;
};

function resolveNeutralOtpHost(): string | null {
  const configured = process.env.IDA_HOST?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured.includes('://') ? configured : `http://${configured}`);
    const authority = url.host.toLowerCase();
    return evaluateNeutralOtpHost(new Headers({ host: authority }), { IDA_HOST: configured })
      ? authority
      : null;
  } catch {
    return null;
  }
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const defaultPublicTenantId = resolveDefaultPublicTenantId();
  const neutralOtpHost = resolveNeutralOtpHost();

  const [allMessages] = await Promise.all([getMessages()]);
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, HOME_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <main
        className="min-h-screen"
        data-testid="landing-page-ready"
        data-experiment="home-funnel"
        data-variant="hero_v2"
      >
        <div data-testid="page-ready" className="sr-only" aria-hidden="true" />
        <Header />
        <HomePageRuntime
          defaultPublicTenantId={defaultPublicTenantId}
          locale={locale}
          neutralOtpHost={neutralOtpHost}
          uiV2Enabled={true}
        />
        <PricingSection />
        <Footer />
      </main>
    </NextIntlClientProvider>
  );
}
