import {
  CTASection,
  ClaimCategoriesSection,
  Footer,
  Header,
  HeroSection,
  HowItWorksSection,
  PricingSection,
  TrustStrip,
} from './components/home';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen">
      <Header />
      <HeroSection />
      <TrustStrip />
      <ClaimCategoriesSection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </main>
  );
}
