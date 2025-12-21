import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  Car,
  FileCheck,
  Gavel,
  HeartPulse,
  MapPin,
  MessageCircle,
  Phone,
  Scale,
  ScrollText,
  Shield,
  Stethoscope,
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

  // Service icons mapping
  const consultationIcons = [Scale, ScrollText, HeartPulse, Calculator, BadgeCheck, MapPin];
  const expertiseIcons = [FileCheck, Shield];
  const legalIcons = [Gavel, Scale];
  const expertIcons = [Car, Stethoscope, Users];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-28 overflow-hidden bg-gradient-to-br from-slate-50 to-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-bold mb-6">
              <Shield className="h-4 w-4" />
              {t('hero.badge')}
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black text-slate-900 mb-6 tracking-tight">
              {t('hero.title')}
            </h1>
            <p className="text-xl text-slate-500 leading-relaxed mb-8">{t('hero.subtitle')}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="xl" className="h-14 px-10 font-bold shadow-lg shadow-primary/30">
                  {t('cta.primary')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              {telHref && (
                <a href={telHref}>
                  <Button variant="outline" size="xl" className="h-14 px-10 font-bold border-2">
                    <Phone className="mr-2 h-5 w-5" />
                    {t('cta.secondary')}
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Category 1: Free Consultations */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-black text-slate-900 mb-4 tracking-tight">
              {t('categories.consultation.title')}
            </h2>
            <p className="text-lg text-slate-500">{t('categories.consultation.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[0, 1, 2, 3, 4, 5].map(i => {
              const Icon = consultationIcons[i];
              return (
                <div
                  key={i}
                  className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg hover:shadow-xl transition-shadow group"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="h-7 w-7 text-emerald-600" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold">
                      {t(`categories.consultation.services.${i}.badge`)}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">
                    {t(`categories.consultation.services.${i}.title`)}
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {t(`categories.consultation.services.${i}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Category 2: Expertise & Assessment */}
      <section className="py-16 lg:py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-black text-slate-900 mb-4 tracking-tight">
              {t('categories.expertise.title')}
            </h2>
            <p className="text-lg text-slate-500">{t('categories.expertise.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[0, 1].map(i => {
              const Icon = expertiseIcons[i];
              const isDiscount = i === 1;
              return (
                <div
                  key={i}
                  className="bg-white rounded-3xl p-10 border border-slate-100 shadow-xl hover:shadow-2xl transition-shadow group"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div
                      className={`h-16 w-16 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                        isDiscount ? 'bg-amber-50' : 'bg-blue-50'
                      }`}
                    >
                      <Icon
                        className={`h-8 w-8 ${isDiscount ? 'text-amber-600' : 'text-blue-600'}`}
                      />
                    </div>
                    <span
                      className={`px-4 py-1.5 rounded-full text-sm font-bold ${
                        isDiscount ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                      }`}
                    >
                      {t(`categories.expertise.services.${i}.badge`)}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-4">
                    {t(`categories.expertise.services.${i}.title`)}
                  </h3>
                  <p className="text-slate-500 leading-relaxed">
                    {t(`categories.expertise.services.${i}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Category 3: Legal Representation */}
      <section className="py-16 lg:py-24 bg-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-black mb-4 tracking-tight">
              {t('categories.legal.title')}
            </h2>
            <p className="text-lg text-slate-400">{t('categories.legal.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[0, 1].map(i => {
              const Icon = legalIcons[i];
              return (
                <div
                  key={i}
                  className="bg-slate-800 rounded-3xl p-10 border border-slate-700 hover:bg-slate-700/50 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <span className="px-4 py-1.5 rounded-full bg-primary text-white text-sm font-bold">
                      {t(`categories.legal.services.${i}.badge`)}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black mb-4">
                    {t(`categories.legal.services.${i}.title`)}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {t(`categories.legal.services.${i}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Expert Team */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-black text-slate-900 mb-4 tracking-tight">
              {t('experts.title')}
            </h2>
            <p className="text-lg text-slate-500">{t('experts.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[0, 1, 2].map(i => {
              const Icon = expertIcons[i];
              return (
                <div key={i} className="text-center group">
                  <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Icon className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    {t(`experts.list.${i}.title`)}
                  </h3>
                  <p className="text-slate-500">{t(`experts.list.${i}.description`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary/80 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-display font-black mb-4">{t('cta.title')}</h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">{t('cta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button
                size="xl"
                className="h-14 px-10 bg-white text-primary hover:bg-white/90 font-bold shadow-xl"
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
                  className="h-14 px-10 border-white/30 text-white hover:bg-white/10 font-bold"
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
