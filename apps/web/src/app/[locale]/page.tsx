import { BASE_NAMESPACES, HOME_NAMESPACES, pickMessages } from '@/i18n/messages';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import {
  CTASection,
  Footer,
  Header,
  HeroSection,
  HowMembershipWorksSection,
  MemberBenefitsSection,
  PricingSection,
  TrustStrip,
} from './components/home';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

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
        <MemberBenefitsSection />
        <HowMembershipWorksSection />
        <PricingSection />
        <CTASection />
        <Footer />
      </main>
    </NextIntlClientProvider>
  );
}
