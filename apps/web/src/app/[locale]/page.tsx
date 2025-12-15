import { Link } from '@/i18n/routing';
import { flags } from '@/lib/flags';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import {
  ArrowRight,
  Car,
  CheckCircle,
  Clock,
  Home,
  MessageCircle,
  Phone,
  Plane,
  Shield,
  ShieldCheck,
  Star,
  Stethoscope,
} from 'lucide-react';
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

      {/* Trust Strip */}
      <TrustStrip />

      {/* Claim Categories Section */}
      <ClaimCategoriesSection />

      {/* How It Works Section */}
      <HowItWorksSection />

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
            href="/services"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            Services
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('pricing')}
          </Link>
          <Link
            href="/contact"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('contact')}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {/* Mobile Call Button */}
          <a
            href="tel:+38349900600"
            className="md:hidden flex items-center justify-center h-9 w-9 rounded-full bg-[hsl(var(--success))] text-white"
          >
            <Phone className="h-4 w-4" />
          </a>
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
  const slaEnabled = flags.responseSla;

  return (
    <section className="relative py-16 lg:py-28 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 brand-gradient-light" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] text-sm font-medium mb-6 animate-fade-in">
            <ShieldCheck className="h-4 w-4" />
            {t('badge')}
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-6 animate-fade-in">
            {t('title')}
          </h1>
          <p
            className="text-lg md:text-xl text-[hsl(var(--muted-500))] mb-8 max-w-2xl mx-auto animate-slide-up"
            style={{ animationDelay: '0.1s' }}
          >
            {t('subtitle')}
          </p>

          {/* CTA Buttons */}
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
            <a href="tel:+38349900600">
              <Button variant="outline" size="xl" className="w-full sm:w-auto gap-2">
                <Phone className="h-5 w-5" />
                {t('callNow')}
              </Button>
            </a>
          </div>

          {/* Trust indicators */}
          <div
            className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-[hsl(var(--muted-400))] animate-fade-in"
            style={{ animationDelay: '0.3s' }}
          >
            {slaEnabled && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {t('responseTime')}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              {t('noWinNoFee')}
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              {t('rating')}
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" />
              {t('claimAdjuster')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const t = useTranslations('trust');
  const slaEnabled = flags.responseSla;

  const stats = [
    { value: '1,200+', label: t('claimsProcessed') },
    { value: '€850K+', label: t('compensationWon') },
    { value: '94%', label: t('successRate') },
    ...(slaEnabled ? [{ value: '<24h', label: t('responseTime') }] : []),
  ];

  return (
    <section className="py-8 bg-[hsl(var(--surface-strong))] border-y">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-[hsl(var(--primary))]">
                {stat.value}
              </div>
              <div className="text-sm text-[hsl(var(--muted-500))]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClaimCategoriesSection() {
  const t = useTranslations('claimCategories');

  const categories = [
    {
      icon: Car,
      title: t('vehicle.title'),
      description: t('vehicle.description'),
      examples: t('vehicle.examples'),
      href: '/dashboard/claims/new?category=vehicle',
    },
    {
      icon: Home,
      title: t('property.title'),
      description: t('property.description'),
      examples: t('property.examples'),
      href: '/dashboard/claims/new?category=property',
    },
    {
      icon: Stethoscope,
      title: t('injury.title'),
      description: t('injury.description'),
      examples: t('injury.examples'),
      href: '/dashboard/claims/new?category=injury',
    },
    {
      icon: Plane,
      title: t('travel.title'),
      description: t('travel.description'),
      examples: t('travel.examples'),
      href: '/dashboard/claims/new?category=travel',
    },
  ];

  return (
    <section className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t('title')}</h2>
          <p className="text-[hsl(var(--muted-500))] max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((category, index) => (
            <Link
              key={index}
              href={category.href}
              className="group glass-card rounded-xl p-6 card-lift animate-fade-in hover:ring-2 hover:ring-[hsl(var(--primary))] transition-all"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="h-14 w-14 rounded-xl brand-gradient flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <category.icon className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{category.title}</h3>
              <p className="text-[hsl(var(--muted-500))] text-sm mb-3">{category.description}</p>
              <p className="text-xs text-[hsl(var(--muted-400))]">{category.examples}</p>
              <div className="mt-4 flex items-center text-sm font-medium text-[hsl(var(--primary))] group-hover:gap-2 transition-all">
                {t('startClaim')}
                <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const t = useTranslations('howItWorks');

  const steps = [
    {
      number: '01',
      title: t('step1.title'),
      description: t('step1.description'),
    },
    {
      number: '02',
      title: t('step2.title'),
      description: t('step2.description'),
    },
    {
      number: '03',
      title: t('step3.title'),
      description: t('step3.description'),
    },
    {
      number: '04',
      title: t('step4.title'),
      description: t('step4.description'),
    },
  ];

  return (
    <section className="py-16 lg:py-20 bg-[hsl(var(--surface-strong))]">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t('title')}</h2>
          <p className="text-[hsl(var(--muted-500))]">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div key={index} className="relative text-center">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[60%] w-full h-0.5 bg-[hsl(var(--border))]" />
              )}
              <div className="relative inline-flex items-center justify-center h-16 w-16 rounded-full brand-gradient text-white text-xl font-bold mb-4">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-[hsl(var(--muted-500))]">{step.description}</p>
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
          {t('ctaTitle')}
        </h2>
        <p className="text-white/80 max-w-2xl mx-auto mb-8">{t('ctaSubtitle')}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
          <a href="tel:+38349900600">
            <Button
              size="xl"
              variant="outline"
              className="border-white text-white hover:bg-white/10"
            >
              <Phone className="mr-2 h-5 w-5" />
              049 900 600
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const t = useTranslations('footer');
  const common = useTranslations('common');
  const { phone, whatsapp, address, hours } = contactInfo;

  return (
    <footer className="bg-[hsl(var(--muted-900))] text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-6 w-6 text-[hsl(var(--primary))]" />
              <span className="font-display font-bold">{common('appName')}</span>
            </div>
            <p className="text-sm text-white/70 mb-4">{t('description')}</p>
            {/* Contact info */}
            <div className="space-y-2 text-sm">
              {phone && (
                <a
                  href={`tel:${phone.replace(/\\s+/g, '')}`}
                  className="flex items-center gap-2 text-white hover:text-[hsl(var(--primary))] transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  {phone}
                </a>
              )}
              {whatsapp && (
                <a
                  href={whatsapp}
                  className="flex items-center gap-2 text-white hover:text-[hsl(var(--success))] transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
              {address && (
                <p className="flex items-center gap-2 text-white/80">
                  <Shield className="h-4 w-4" />
                  {address}
                </p>
              )}
              {hours && <p className="text-white/60 text-xs">{t('hours', { hours })}</p>}
            </div>
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
                <Link href="/services" className="hover:text-white transition-colors">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-white transition-colors">
                  {t('careers')}
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
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-white/60">
            {t('copyright', { year: new Date().getFullYear() })}
          </p>
          <p className="text-xs text-white/40">{t('disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
}
