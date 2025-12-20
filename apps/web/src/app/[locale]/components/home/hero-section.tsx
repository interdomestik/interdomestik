import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { flags } from '@/lib/flags';
import { Button } from '@interdomestik/ui';
import { ArrowRight, MessageCircle, Phone, Scale, ShieldCheck, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HeroSection() {
  const t = useTranslations('hero');
  const slaEnabled = flags.responseSla;
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  return (
    <section className="relative py-20 lg:py-32 overflow-hidden bg-mesh">
      {/* Decorative background elements */}
      <div className="absolute top-1/4 -left-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
      <div
        className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse-soft"
        style={{ animationDelay: '1s' }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm border shadow-sm text-primary text-sm font-bold mb-8 animate-fade-in badge-glow cursor-default">
            <ShieldCheck className="h-4 w-4" />
            {t('badge')}
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black mb-8 animate-fade-in tracking-tighter leading-[1.1]">
            {t('title').split(' ').slice(0, -1).join(' ')}{' '}
            <span className="text-primary text-[length:inherit]">
              {t('title').split(' ').pop()}
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-slide-up font-medium"
            style={{ animationDelay: '0.1s' }}
          >
            {t('subtitle')}
          </p>

          <div
            className="flex flex-col sm:flex-row gap-5 justify-center animate-slide-up"
            style={{ animationDelay: '0.2s' }}
          >
            <Link href="/register">
              <Button
                size="xl"
                className="w-full sm:w-auto h-14 px-10 text-lg shadow-xl cta-press group"
              >
                {t('cta')}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            {whatsapp && (
              <a href={whatsapp} className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="xl"
                  className="w-full sm:w-auto h-14 px-8 gap-2 bg-white/80 backdrop-blur-sm border shadow-sm hover:bg-white interactive-press text-slate-700"
                >
                  <MessageCircle className="h-5 w-5 text-green-600" />
                  {t('whatsappCta')}
                </Button>
              </a>
            )}
            {telHref && (
              <a href={telHref} className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="xl"
                  className="w-full sm:w-auto h-14 px-8 gap-2 bg-white/40 backdrop-blur-sm border-white/40 hover:bg-white/60 interactive-press"
                >
                  <Phone className="h-5 w-5 text-primary" />
                  <span className="font-bold">{phone}</span>
                </Button>
              </a>
            )}
          </div>

          <div
            className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-semibold text-muted-foreground animate-fade-in"
            style={{ animationDelay: '0.3s' }}
          >
            {slaEnabled && (
              <span className="flex items-center gap-2 group cursor-default first:border-l-0 first:pl-0">
                <div className="p-1 px-2 rounded-md bg-amber-50 text-amber-700 transition-colors group-hover:bg-amber-100">
                  <Phone className="h-3.5 w-3.5 inline mr-1" />
                  {t('emergencyHotline')}
                </div>
              </span>
            )}
            <span className="flex items-center gap-2 border-l pl-8 first:border-l-0 first:pl-0">
              <MessageCircle className="h-4 w-4 text-green-600" />
              {t('voiceClaims')}
            </span>
            <span className="flex items-center gap-2 border-l pl-8">
              <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
              {t('rating')}
            </span>
            <span className="flex items-center gap-2 border-l pl-8">
              <Scale className="h-4 w-4 text-primary" />
              {t('legalMediation')}
            </span>
          </div>

          {/* Trust badges row */}
          <div
            className="mt-8 flex flex-wrap items-center justify-center gap-4 animate-fade-in"
            style={{ animationDelay: '0.4s' }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('guarantee')}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
              {t('slaBadge')}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100">
              {t('priceAnchor')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
