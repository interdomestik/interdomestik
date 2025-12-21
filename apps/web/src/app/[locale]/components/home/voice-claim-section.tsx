import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { CheckCircle2, MessageCircle, Phone, Sparkles } from 'lucide-react';
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
    <section className="relative py-20 lg:py-28 overflow-hidden">
      {/* Beautiful gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600" />

      {/* Animated mesh overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-400 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-400 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-300 rounded-full blur-3xl opacity-50" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          {/* Sparkle badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-sm font-bold mb-8 shadow-lg">
            <Sparkles className="h-4 w-4 text-amber-300" />
            {t('badge')}
          </div>

          {/* Big bold title */}
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-display font-black text-white mb-6 tracking-tight leading-[0.95]">
            {t('title').split('.')[0]}.
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200">
              {t('title').split('.')[1]?.trim() || 'Kaq.'}
            </span>
          </h2>

          <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed">
            {t('subtitle')}
          </p>

          {/* Steps - Glass cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-12 max-w-3xl mx-auto">
            {steps.map(step => (
              <div
                key={step.number}
                className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all hover:scale-105"
              >
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-900 font-black text-xl flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110 transition-transform">
                  {step.number}
                </div>
                <span className="text-white font-semibold">{step.text}</span>
              </div>
            ))}
          </div>

          {/* Stats - Big numbers */}
          <div className="flex justify-center gap-8 md:gap-16 mb-14">
            <div className="text-center">
              <div className="text-6xl md:text-7xl font-black text-white mb-2">
                {t('stats.time')}
              </div>
              <div className="text-sm text-white/60 font-medium uppercase tracking-wider">
                {t('stats.timeLabel')}
              </div>
            </div>
            <div className="w-px bg-white/20 self-stretch" />
            <div className="text-center">
              <div className="text-6xl md:text-7xl font-black text-white mb-2">
                {t('stats.noForms')}
              </div>
              <div className="text-sm text-white/60 font-medium uppercase tracking-wider">
                {t('stats.noFormsLabel')}
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {telHref && (
              <div className="relative">
                {/* Pulsing ring indicator */}
                <div className="absolute -inset-2 bg-white/20 rounded-3xl animate-ping opacity-75" />
                <div className="absolute -inset-1 bg-white/10 rounded-3xl animate-pulse" />

                {/* Arrow pointing to button */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce">
                  <span className="text-amber-300 text-sm font-bold mb-1">👆</span>
                  <div className="w-0.5 h-4 bg-amber-300/50" />
                </div>

                <a href={telHref} className="relative">
                  <Button
                    size="xl"
                    className="h-16 px-12 text-lg font-bold bg-white text-purple-700 hover:bg-white/90 rounded-2xl shadow-2xl shadow-black/20 transition-all hover:scale-105"
                  >
                    {/* Animated ringing phone */}
                    <div className="relative mr-3">
                      <Phone className="h-6 w-6 animate-wiggle" />
                      <div className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full animate-ping" />
                      <div className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full" />
                    </div>
                    {t('cta')}
                  </Button>
                </a>
              </div>
            )}
            {whatsapp && (
              <a href={whatsapp}>
                <Button
                  size="xl"
                  variant="outline"
                  className="h-16 px-12 text-lg font-bold bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white hover:bg-white/20 rounded-2xl transition-all hover:scale-105"
                >
                  <MessageCircle className="h-5 w-5 mr-3" />
                  {t('whatsappCta')}
                </Button>
              </a>
            )}
          </div>

          {/* Trust checkmarks */}
          <div className="mt-12 flex flex-wrap justify-center gap-6 text-white/70">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-medium">Pa stres</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-medium">Pa pritje</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-medium">Pa formularë</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
