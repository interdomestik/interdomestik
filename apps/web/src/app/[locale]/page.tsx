import { BASE_NAMESPACES, HOME_NAMESPACES, pickMessages } from '@/i18n/messages';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getLocaleLandingCore } from './_core';
import {
  CTASection,
  FAQSection,
  Footer,
  Header,
  HeroSection,
  HowMembershipWorksSection,
  MemberBenefitsSection,
  PricingSection,
  StickyPrimeCTA,
  TestimonialsSection,
  TrustStatsSection,
  TrustStrip,
  VoiceClaimSection,
} from './components/home';

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

  const allMessages = await getMessages();
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
