import { BASE_NAMESPACES, HOME_NAMESPACES, pickMessages } from '@/i18n/messages';
import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { resolvePublicAdmissionTenant } from '@/lib/tenant/public-admission-tenant';
import { authorizeOpenPublicIntake } from '@/lib/tenant/public-intake-admission';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';

// Vercel Best Practice: Direct Imports (bundle-barrel-imports)
// Avoid barrel files for heavy landing page components to improve tree-shaking
import { Footer } from './components/home/footer';
import { Header } from './components/home/header';
import { HomePageRuntime } from './components/home/home-page-runtime';
import { PricingSection } from './components/home/pricing-section';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

export const instant = false;

type Props = {
  params: Promise<{ locale: string }>;
};

function resolveNeutralOtpHost(): string | null {
  const configured = process.env.IDA_HOST?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured.includes('://') ? configured : `http://${configured}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const authority = url.host.toLowerCase();
    return evaluateNeutralOtpHost(new Headers({ host: authority })) ? authority : null;
  } catch {
    return null;
  }
}

export default async function HomePage({ params }: Props) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const admissionTenantId = resolvePublicAdmissionTenant(await headers());
  const publicIntakeOpen = (await authorizeOpenPublicIntake(admissionTenantId)) !== null;
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
          publicIntakeOpen={publicIntakeOpen}
          uiV2Enabled={true}
        />
        <PricingSection publicIntakeOpen={publicIntakeOpen} />
        <Footer />
      </main>
    </NextIntlClientProvider>
  );
}
