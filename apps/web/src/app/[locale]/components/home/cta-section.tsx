import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { ArrowRight, MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export function CTASection() {
  const t = useTranslations('hero');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

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
          {whatsapp && (
            <a href={whatsapp}>
              <Button
                size="xl"
                variant="secondary"
                className="bg-white text-[hsl(var(--primary))] hover:bg-white/90 border-white gap-2"
              >
                <MessageCircle className="h-5 w-5" />
                {t('whatsappCta')}
              </Button>
            </a>
          )}
          {telHref && (
            <a href={telHref}>
              <Button
                size="xl"
                variant="outline"
                className="border-white text-white hover:bg-white/10 gap-2"
              >
                <Phone className="mr-2 h-5 w-5" />
                {phone}
              </Button>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
