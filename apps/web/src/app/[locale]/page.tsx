import { BASE_NAMESPACES, HOME_NAMESPACES, pickMessages } from '@/i18n/messages';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getLocaleLandingCore } from './_core';

// Vercel Best Practice: Direct Imports (bundle-barrel-imports)
// Avoid barrel files for heavy landing page components to improve tree-shaking
import { CTASection } from './components/home/cta-section';
import { Footer } from './components/home/footer';
import { Header } from './components/home/header';
import { HeroSection } from './components/home/hero-section';
import { HowMembershipWorksSection } from './components/home/how-membership-works-section';
import { MemberBenefitsSection } from './components/home/member-benefits-section';
import { PricingSection } from './components/home/pricing-section';
import { StickyPrimeCTA } from './components/home/sticky-mobile-cta';
import { TrustStatsSection } from './components/home/trust-stats-section';
import { TrustStrip } from './components/home/trust-strip';
import { VoiceClaimSection } from './components/home/voice-claim-section';

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

  // Future: Fetch real session here if needed for redirection
  const decision = getLocaleLandingCore({ locale, session: null });

  if (decision.kind === 'redirect') {
    redirect(decision.destination);
  }

  const [allMessages] = await Promise.all([getMessages()]);
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, HOME_NAMESPACES),
  };

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <main className="min-h-screen">
        <Header />
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
        <Footer />
        <StickyPrimeCTA />
      </main>
    </NextIntlClientProvider>
  );
}
