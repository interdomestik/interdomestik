import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { ArrowRight, CheckCircle2, MessageCircle, Phone, Shield, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HeroSection() {
  const t = useTranslations('hero');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  return (
    <section className="relative py-24 lg:py-32 overflow-hidden bg-white">
      {/* Subtle decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Clean Prime Badge - matching header style */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold mb-8 shadow-lg shadow-primary/20">
            <Shield className="h-4 w-4" />
            <span className="tracking-wide uppercase">{t('badge')}</span>
          </div>

          {/* Title - Prime Typography */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black text-slate-900 mb-6 tracking-tight leading-[0.95]">
            {t('title').split(' ').slice(0, -1).join(' ')}{' '}
            <span className="text-primary">{t('title').split(' ').pop()}</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            {t('subtitle')}
          </p>

          {/* CTA Buttons - Clean consistent style */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/register">
              <Button
                size="xl"
                className="h-14 px-10 text-lg font-bold rounded-xl shadow-lg shadow-primary/20"
              >
                {t('cta')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>

            {telHref && (
              <a href={telHref}>
                <Button
                  size="xl"
                  variant="outline"
                  className="h-14 px-8 text-lg font-bold rounded-xl border-2 border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <Phone className="mr-2 h-5 w-5 text-primary" />
                  {t('callNow')}
                </Button>
              </a>
            )}

            {whatsapp && (
              <a href={whatsapp}>
                <Button
                  size="xl"
                  variant="outline"
                  className="h-14 px-8 text-lg font-bold rounded-xl border-2 border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                >
                  <MessageCircle className="mr-2 h-5 w-5" />
                  WhatsApp
                </Button>
              </a>
            )}
          </div>

          {/* Trust Indicators - Clean pills */}
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              {t('noWinNoFee')}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold border border-blue-100">
              <ShieldCheck className="h-4 w-4" />
              {t('guarantee')}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-100">
              <Phone className="h-4 w-4" />
              {t('emergencyHotline')}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
