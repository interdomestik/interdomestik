import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import {
  ArrowRight,
  Calculator,
  Car,
  CheckCircle2,
  FileText,
  Gavel,
  HeartPulse,
  Landmark,
  MapPin,
  MessageCircle,
  Mic,
  Phone,
  Scale,
  Shield,
  Stethoscope,
  UserCheck,
  Users,
} from 'lucide-react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

interface ServicesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ServicesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'servicesPage.meta' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function ServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'servicesPage' });
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  // Service icons
  const consultationIcons = [Scale, FileText, HeartPulse, Calculator, Shield, MapPin];
  const expertiseIcons = [FileText, UserCheck];
  const legalIcons = [Gavel, Landmark];
  const expertIcons = [Car, Stethoscope, Users];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section - Gradient Blue like Voice Claim */}
      <section className="relative py-24 lg:py-32 bg-gradient-to-br from-primary to-primary/80 text-white overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/20 text-white text-sm font-bold mb-8">
              <Mic className="h-4 w-4" />
              {t('hero.badge')}
            </span>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black mb-6 tracking-tight">
              {t('hero.title')}
            </h1>
            <p className="text-xl md:text-2xl text-white/80 leading-relaxed mb-10 max-w-2xl mx-auto">
              {t('hero.subtitle')}
            </p>

            {/* Stats Row */}
            <div className="flex justify-center gap-12 mb-12">
              <div className="text-center">
                <div className="text-6xl font-black">10</div>
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider">
                  shërbime
                </div>
              </div>
              <div className="w-px bg-white/20" />
              <div className="text-center">
                <div className="text-6xl font-black">6</div>
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider">
                  FALAS
                </div>
              </div>
              <div className="w-px bg-white/20" />
              <div className="text-center">
                <div className="text-6xl font-black">24/7</div>
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider">
                  mbështetje
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button
                  size="xl"
                  className="h-14 px-10 bg-white text-primary hover:bg-white/90 font-bold shadow-xl rounded-full"
                >
                  {t('cta.primary')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              {telHref && (
                <a href={telHref}>
                  <Button
                    variant="outline"
                    size="xl"
                    className="h-14 px-10 border-white/30 text-white hover:bg-white/10 font-bold rounded-full"
                  >
                    <Phone className="mr-2 h-5 w-5" />
                    {t('cta.secondary')}
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Category 1: Free Consultations - White with emerald accents */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold mb-4">
              <CheckCircle2 className="h-4 w-4" />
              FALAS
            </span>
            <h2 className="text-4xl md:text-5xl font-display font-black text-slate-900 mb-4 tracking-tight">
              {t('categories.consultation.title')}
            </h2>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">
              {t('categories.consultation.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[0, 1, 2, 3, 4, 5].map(i => {
              const Icon = consultationIcons[i];
              return (
                <div
                  key={i}
                  className="relative bg-gradient-to-br from-slate-50 to-white rounded-3xl p-8 border border-slate-100 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 group"
                >
                  {/* Free badge */}
                  <div className="absolute -top-3 -right-3 px-4 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-black shadow-lg">
                    {t(`categories.consultation.services.${i}.badge`)}
                  </div>

                  <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Icon className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-3">
                    {t(`categories.consultation.services.${i}.title`)}
                  </h3>
                  <p className="text-slate-500 leading-relaxed">
                    {t(`categories.consultation.services.${i}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Category 2: Expertise & Assessment - Dark slate */}
      <section className="py-20 lg:py-28 bg-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold mb-4">
              <Shield className="h-4 w-4" />
              EKSPERTIZË
            </span>
            <h2 className="text-4xl md:text-5xl font-display font-black mb-4 tracking-tight">
              {t('categories.expertise.title')}
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              {t('categories.expertise.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[0, 1].map(i => {
              const Icon = expertiseIcons[i];
              const isDiscount = i === 1;
              return (
                <div
                  key={i}
                  className="relative bg-slate-800 rounded-3xl p-10 border border-slate-700 hover:bg-slate-700/50 transition-all group"
                >
                  {/* Badge */}
                  <div
                    className={`absolute -top-3 -right-3 px-4 py-1.5 rounded-full text-white text-sm font-black shadow-lg ${
                      isDiscount ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                  >
                    {t(`categories.expertise.services.${i}.badge`)}
                  </div>

                  <div
                    className={`h-20 w-20 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform ${
                      isDiscount ? 'bg-amber-500/20' : 'bg-blue-500/20'
                    }`}
                  >
                    <Icon
                      className={`h-10 w-10 ${isDiscount ? 'text-amber-400' : 'text-blue-400'}`}
                    />
                  </div>
                  <h3 className="text-2xl font-black mb-4">
                    {t(`categories.expertise.services.${i}.title`)}
                  </h3>
                  <p className="text-slate-400 text-lg leading-relaxed">
                    {t(`categories.expertise.services.${i}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Category 3: Legal Representation - Gradient */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-indigo-600 to-purple-700 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white text-sm font-bold mb-4">
              <Gavel className="h-4 w-4" />
              LIGJOR
            </span>
            <h2 className="text-4xl md:text-5xl font-display font-black mb-4 tracking-tight">
              {t('categories.legal.title')}
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              {t('categories.legal.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[0, 1].map(i => {
              const Icon = legalIcons[i];
              return (
                <div
                  key={i}
                  className="relative bg-white/10 backdrop-blur-sm rounded-3xl p-10 border border-white/20 hover:bg-white/20 transition-all group"
                >
                  {/* Badge */}
                  <div className="absolute -top-3 -right-3 px-4 py-1.5 rounded-full bg-white text-indigo-600 text-sm font-black shadow-lg">
                    {t(`categories.legal.services.${i}.badge`)}
                  </div>

                  <div className="h-20 w-20 rounded-3xl bg-white/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                    <Icon className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-black mb-4">
                    {t(`categories.legal.services.${i}.title`)}
                  </h3>
                  <p className="text-white/70 text-lg leading-relaxed">
                    {t(`categories.legal.services.${i}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Expert Team - Clean white */}
      <section className="py-20 lg:py-28 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-display font-black text-slate-900 mb-4 tracking-tight">
              {t('experts.title')}
            </h2>
            <p className="text-xl text-slate-500">{t('experts.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[0, 1, 2].map(i => {
              const Icon = expertIcons[i];
              return (
                <div key={i} className="text-center group">
                  <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-lg">
                    <Icon className="h-12 w-12 text-primary" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">
                    {t(`experts.list.${i}.title`)}
                  </h3>
                  <p className="text-slate-500">{t(`experts.list.${i}.description`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA - Gradient blue */}
      <section className="py-24 bg-gradient-to-br from-primary to-primary/80 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-display font-black mb-6">{t('cta.title')}</h2>
          <p className="text-xl text-white/80 mb-12 max-w-2xl mx-auto">{t('cta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button
                size="xl"
                className="h-14 px-10 bg-white text-primary hover:bg-white/90 font-bold shadow-xl rounded-full"
              >
                {t('cta.primary')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            {whatsapp && (
              <a href={whatsapp}>
                <Button
                  size="xl"
                  variant="outline"
                  className="h-14 px-10 border-white/30 text-white hover:bg-white/10 font-bold rounded-full"
                >
                  <MessageCircle className="mr-2 h-5 w-5" />
                  WhatsApp
                </Button>
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
