import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { flags } from '@/lib/flags';
import { Button } from '@interdomestik/ui';
import { ArrowRight, Clock, MessageCircle, Phone, ShieldCheck, Star, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HeroSection() {
  const t = useTranslations('hero');
  const slaEnabled = flags.responseSla;
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  return (
    <section className="relative py-16 lg:py-28 overflow-hidden">
      <div className="absolute inset-0 brand-gradient-light" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
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
            {whatsapp && (
              <a href={whatsapp} className="w-full sm:w-auto">
                <Button variant="secondary" size="xl" className="w-full sm:w-auto gap-2">
                  <MessageCircle className="h-5 w-5" />
                  {t('whatsappCta')}
                </Button>
              </a>
            )}
            {telHref && (
              <a href={telHref} className="w-full sm:w-auto">
                <Button variant="outline" size="xl" className="w-full sm:w-auto gap-2">
                  <Phone className="h-5 w-5" />
                  {phone}
                </Button>
              </a>
            )}
          </div>

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
