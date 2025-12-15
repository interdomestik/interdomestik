import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { ArrowRight, CheckCircle, FileText, MessageCircle, Shield, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <HeroSection />

      {/* Features Section */}
      <FeaturesSection />

      {/* Pricing Section */}
      <PricingSection />

      {/* CTA Section */}
      <CTASection />

      {/* Footer */}
      <Footer />
    </main>
  );
}

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
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
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

function HeroSection() {
  const t = useTranslations('hero');

  return (
    <section className="relative py-20 lg:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 brand-gradient-light" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-6 animate-fade-in">
            Activate Your Assistant!
          </h1>
          <p
            className="text-lg md:text-xl text-[hsl(var(--muted-500))] mb-8 max-w-2xl mx-auto animate-slide-up"
            style={{ animationDelay: '0.1s' }}
          >
            "Easier Together" — We mediate your damage claims with professionalism and care.
          </p>
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up"
            style={{ animationDelay: '0.2s' }}
          >
            <Link href="/register">
              <Button size="xl" className="w-full sm:w-auto">
                {t('cta')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="xl" className="w-full sm:w-auto">
                {t('secondaryCta')}
              </Button>
            </Link>
          </div>
          <p
            className="mt-8 text-sm text-[hsl(var(--muted-400))] animate-fade-in"
            style={{ animationDelay: '0.3s' }}
          >
            {t('trustedBy')}
          </p>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const t = useTranslations('features');

  const features = [
    {
      icon: Shield,
      title: 'Legal Basis Determination',
      description: 'Free consultation to determine if you have a valid claim for compensation.',
    },
    {
      icon: FileText,
      title: 'Claim Management',
      description: 'End-to-end handling of your case from submission to final payout.',
    },
    {
      icon: Users,
      title: 'Physical Injury Claims',
      description: 'Expert support for medical and rehabilitation compensation.',
    },
    {
      icon: MessageCircle,
      title: 'Material Damage',
      description: 'Fast processing for vehicle and property damage claims.',
    },
  ];

  return (
    <section className="py-20 bg-[hsl(var(--surface-strong))]">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-12">
          {t('title')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="glass-card rounded-xl p-6 card-lift animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="h-12 w-12 rounded-lg brand-gradient flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-[hsl(var(--muted-500))] text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
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
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t('title')}</h2>
          <p className="text-[hsl(var(--muted-500))]">{t('subtitle')}</p>
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

function CTASection() {
  const t = useTranslations('hero');

  return (
    <section className="py-20 brand-gradient">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-6">
          {t('title')}
        </h2>
        <p className="text-white/80 max-w-2xl mx-auto mb-8">{t('subtitle')}</p>
        <Link href="/register">
          <Button
            size="xl"
            variant="outline"
            className="bg-white text-[hsl(var(--primary))] hover:bg-white/90 border-white"
          >
            {t('cta')}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
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
                <a
                  href="tel:+38349900600"
                  className="hover:text-white transition-colors font-semibold"
                >
                  049 900 600
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/38349900600"
                  className="hover:text-white transition-colors flex items-center gap-2"
                >
                  WhatsApp
                </a>
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
          {t('copyright', { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  );
}
