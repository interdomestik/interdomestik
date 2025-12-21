import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { MessageCircle, Mic, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function VoiceClaimSection() {
  const t = useTranslations('voiceClaim');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  const steps = [
    { number: '1', text: t('step1') },
    { number: '2', text: t('step2') },
    { number: '3', text: t('step3') },
  ];

  return (
    <section className="py-16 lg:py-24 bg-gradient-to-br from-primary to-primary/80 text-white overflow-hidden relative">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white text-sm font-bold mb-6">
            <Mic className="h-4 w-4" />
            {t('badge')}
          </span>

          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-black mb-6 tracking-tight">
            {t('title')}
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">{t('subtitle')}</p>

          {/* Steps */}
          <div className="flex flex-wrap justify-center gap-6 mb-10">
            {steps.map(step => (
              <div key={step.number} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white text-primary font-black flex items-center justify-center shadow-lg">
                  {step.number}
                </div>
                <span className="font-semibold">{step.text}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="flex justify-center gap-12 mb-12">
            <div className="text-center">
              <div className="text-5xl font-black">{t('stats.time')}</div>
              <div className="text-sm text-white/60 font-medium">{t('stats.timeLabel')}</div>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <div className="text-5xl font-black">{t('stats.noForms')}</div>
              <div className="text-sm text-white/60 font-medium">{t('stats.noFormsLabel')}</div>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {telHref && (
              <a href={telHref}>
                <Button
                  size="xl"
                  className="w-full sm:w-auto h-14 px-10 bg-white text-primary hover:bg-white/90 font-bold shadow-xl"
                >
                  <Phone className="h-5 w-5 mr-2" />
                  {t('cta')}
                </Button>
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp}>
                <Button
                  size="xl"
                  variant="outline"
                  className="w-full sm:w-auto h-14 px-10 border-white/30 text-white hover:bg-white/10 font-bold"
                >
                  <MessageCircle className="h-5 w-5 mr-2" />
                  {t('whatsappCta')}
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
