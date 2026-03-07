import { BASE_NAMESPACES, HOME_NAMESPACES, pickMessages } from '@/i18n/messages';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { isUiV2Enabled } from '@/lib/flags';
import dynamic from 'next/dynamic';

// Vercel Best Practice: Direct Imports (bundle-barrel-imports)
// Avoid barrel files for heavy landing page components to improve tree-shaking
import { CTASection } from './components/home/cta-section';
import { Footer } from './components/home/footer';
import { Header } from './components/home/header';
import { HeroSection } from './components/home/hero-section';
import { HomePageRuntime } from './components/home/home-page-runtime';
import { HowMembershipWorksSection } from './components/home/how-membership-works-section';
import { MemberBenefitsSection } from './components/home/member-benefits-section';
import { PricingSection } from './components/home/pricing-section';
import { StickyPrimeCTA } from './components/home/sticky-mobile-cta';
import { TrustStatsSection } from './components/home/trust-stats-section';
import { TrustStrip } from './components/home/trust-strip';
import { VoiceClaimSection } from './components/home/voice-claim-section';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

// Vercel Best Practice: Dynamic Imports (bundle-dynamic-imports)
// Load below-the-fold sections dynamically to reduce initial JS payload
const FAQSection = dynamic(() => import('./components/home/faq-section').then(m => m.FAQSection));
const TestimonialsSection = dynamic(() =>
  import('./components/home/testimonials-section').then(m => m.TestimonialsSection)
);

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const uiV2Enabled = isUiV2Enabled();

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
        data-variant={uiV2Enabled ? 'hero_v2' : 'hero_v1'}
      >
        <div data-testid="page-ready" className="sr-only" aria-hidden="true" />
        <Header />
        <HomePageRuntime locale={locale} uiV2Enabled={uiV2Enabled} />
        {uiV2Enabled ? (
          <>
            <TrustStrip />
            <VoiceClaimSection />
            <MemberBenefitsSection />
            <PricingSection />
            <HowMembershipWorksSection />
            <TrustStatsSection />
            <TestimonialsSection />
            <FAQSection />
            <CTASection />
          </>
        ) : (
          <>
            <HeroSection />
            <TrustStrip />
            <VoiceClaimSection />
            <MemberBenefitsSection />
            <PricingSection />
            <HowMembershipWorksSection />
            <TrustStatsSection />
            <TestimonialsSection />
            <FAQSection />
            <CTASection />
          </>
        )}
        <Footer />
        {uiV2Enabled ? null : <StickyPrimeCTA />}
      </main>
    </NextIntlClientProvider>
  );
}
