import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { CheckCircle, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen bg-[hsl(var(--background))]">
      <Header />
      <PricingSection />
      <Footer />
    </main>
  );
}

// Reusing Header/Footer locally for now to fix the 404 quickly.
// Ideally these should be extracted to components/layout/site-header.tsx etc.

function Header() {
  const t = useTranslations('nav');
  const common = useTranslations('common');

  return (
    <header className="sticky top-0 z-50 glass-card border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-[hsl(var(--primary))]" />
          <span className="font-display text-xl font-bold">{common('appName')}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('home')}
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-bold text-[hsl(var(--primary))] transition-colors"
          >
            {t('pricing')}
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('about')}
          </Link>
          <Link
            href="/contact"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('contact')}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              {t('login')}
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">{t('register')}</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function PricingSection() {
  const t = useTranslations('pricing');

  const plans = [
    {
      name: t('basic.name'),
      price: t('basic.price'),
      period: t('basic.period'),
      description: t('basic.description'),
      features: t.raw('basic.features') as string[],
      popular: false,
    },
    {
      name: t('standard.name'),
      price: t('standard.price'),
      period: t('standard.period'),
      description: t('standard.description'),
      features: t.raw('standard.features') as string[],
      popular: true,
      popularLabel: t('standard.popular'),
    },
    {
      name: t('premium.name'),
      price: t('premium.price'),
      period: t('premium.period'),
      description: t('premium.description'),
      features: t.raw('premium.features') as string[],
      popular: false,
    },
  ];

  return (
    <section className="py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">{t('title')}</h1>
          <p className="text-xl text-[hsl(var(--muted-500))] max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`glass-card rounded-2xl p-6 relative card-lift ${
                plan.popular ? 'ring-2 ring-[hsl(var(--primary))]' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="brand-gradient text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {plan.popularLabel}
                  </span>
                </div>
              )}
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-[hsl(var(--muted-500))]">{plan.period}</span>
                </div>
                <p className="text-sm text-[hsl(var(--muted-500))] mt-2">{plan.description}</p>
              </div>
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block">
                <Button variant={plan.popular ? 'default' : 'outline'} className="w-full">
                  {t('cta')}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const t = useTranslations('footer');
  const common = useTranslations('common');

  return (
    <footer className="bg-[hsl(var(--muted-900))] text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-6 w-6 text-[hsl(var(--primary))]" />
              <span className="font-display font-bold">{common('appName')}</span>
            </div>
            <p className="text-sm text-white/70">{t('description')}</p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t('company')}</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  {t('about')}
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-white transition-colors">
                  {t('careers')}
                </Link>
              </li>
              <li>
                <Link href="/press" className="hover:text-white transition-colors">
                  {t('press')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t('legal')}</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  {t('privacy')}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  {t('terms')}
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="hover:text-white transition-colors">
                  {t('cookies')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t('support')}</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link href="/help" className="hover:text-white transition-colors">
                  {t('help')}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  {t('contact')}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-white transition-colors">
                  {t('faq')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-8 text-center text-sm text-white/60">
          <p suppressHydrationWarning>
            © {new Date().getFullYear()} Interdomestik. Të gjitha të drejtat e rezervuara.
          </p>
        </div>
      </div>
    </footer>
  );
}
