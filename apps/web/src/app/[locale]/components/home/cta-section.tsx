import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { ArrowRight, MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function CTASection() {
  const t = useTranslations('hero');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  return (
    <section className="py-24 bg-[#051C3E] relative overflow-hidden">
      {/* Subtle decorative circles */}
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 text-center relative z-10">
        <h2 className="text-4xl md:text-5xl font-display font-black text-white mb-6 tracking-tight">
          {t('ctaTitle')}
        </h2>
        <p className="text-white/70 max-w-2xl mx-auto mb-12 text-lg font-medium leading-relaxed">
          {t('ctaSubtitle')}
        </p>
        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <Link href="/register" className="w-full sm:w-auto">
            <Button
              size="xl"
              className="w-full sm:w-auto h-16 px-12 text-lg font-bold shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              {t('cta')}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          {whatsapp && (
            <a href={whatsapp} className="w-full sm:w-auto">
              <Button
                size="xl"
                variant="secondary"
                className="w-full sm:w-auto h-16 px-10 text-lg font-bold bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-sm transition-all"
              >
                <MessageCircle className="h-6 w-6 mr-2 text-green-400" />
                {t('whatsappCta')}
              </Button>
            </a>
          )}
          {telHref && (
            <a href={telHref} className="w-full sm:w-auto">
              <Button
                size="xl"
                variant="outline"
                className="w-full sm:w-auto h-16 px-10 text-lg font-bold border-white/20 text-white hover:bg-white/10 backdrop-blur-sm transition-all"
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
