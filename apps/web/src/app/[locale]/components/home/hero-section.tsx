import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HeroSection() {
  const t = useTranslations('hero');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  return (
    <section className="relative min-h-[90vh] flex items-center py-20 lg:py-28 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Decorative gradient orbs */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-purple-400/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/5 to-purple-500/5 rounded-full blur-3xl" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          {/* Prime Badge */}
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-primary via-purple-600 to-primary text-white text-base font-black mb-10 shadow-2xl shadow-primary/30 border border-primary/30 cursor-default hover:scale-105 transition-transform">
            <div className="relative">
              <ShieldCheck className="h-6 w-6" />
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-amber-400 rounded-full animate-ping" />
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-amber-400 rounded-full" />
            </div>
            <span className="tracking-wide uppercase">{t('badge')}</span>
            <Sparkles className="h-5 w-5 text-amber-300" />
          </div>

          {/* Main Headline - Prime Typography */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black text-slate-900 mb-8 tracking-tight leading-[0.95]">
            {t('title').split(' ').slice(0, -1).join(' ')}{' '}
            <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
              {t('title').split(' ').pop()}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
            {t('subtitle')}
          </p>

          {/* Feature Pills Row */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white shadow-lg border border-slate-100 text-slate-700 text-sm font-semibold">
              <Zap className="h-4 w-4 text-amber-500" />
              {t('emergencyHotline')}
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white shadow-lg border border-slate-100 text-slate-700 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              {t('noWinNoFee')}
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white shadow-lg border border-slate-100 text-slate-700 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {t('rating')}
            </div>
          </div>

          {/* CTA Buttons - Prime Style */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Link href="/register">
              <Button
                size="xl"
                className="h-16 px-12 text-lg font-bold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white border-0 rounded-2xl shadow-2xl shadow-primary/30 transition-all hover:scale-105"
              >
                {t('cta')}
                <ArrowRight className="ml-3 h-5 w-5" />
              </Button>
            </Link>

            {telHref && (
              <a href={telHref}>
                <Button
                  size="xl"
                  variant="outline"
                  className="h-16 px-10 text-lg font-bold bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl shadow-lg transition-all hover:scale-105"
                >
                  <Phone className="mr-3 h-5 w-5 text-primary" />
                  {t('callNow')}
                </Button>
              </a>
            )}

            {whatsapp && (
              <a href={whatsapp}>
                <Button
                  size="xl"
                  variant="outline"
                  className="h-16 px-10 text-lg font-bold bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-2xl shadow-lg transition-all hover:scale-105"
                >
                  <MessageCircle className="mr-3 h-5 w-5" />
                  WhatsApp
                </Button>
              </a>
            )}
          </div>

          {/* Trust Stats Row */}
          <div className="flex justify-center gap-8 md:gap-16 py-8 border-t border-slate-100">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-display font-black text-slate-900">
                €2.5M+
              </div>
              <div className="text-sm text-slate-500 font-medium mt-1">{t('priceAnchor')}</div>
            </div>
            <div className="w-px bg-slate-200 self-stretch" />
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-display font-black text-slate-900">
                5,000+
              </div>
              <div className="text-sm text-slate-500 font-medium mt-1">{t('trustedBy')}</div>
            </div>
            <div className="w-px bg-slate-200 self-stretch" />
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-display font-black text-slate-900">24h</div>
              <div className="text-sm text-slate-500 font-medium mt-1">{t('slaBadge')}</div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-bold border border-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              {t('guarantee')}
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-bold border border-blue-100">
              {t('voiceClaims')}
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-50 text-purple-700 text-sm font-bold border border-purple-100">
              {t('legalMediation')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
