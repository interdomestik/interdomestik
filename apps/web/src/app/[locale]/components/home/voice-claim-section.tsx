import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { CheckCircle2, MessageCircle, Phone, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function VoiceClaimSection() {
  const t = useTranslations('voiceClaim');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  const steps = [
    { number: '1', text: t('step1'), color: 'from-amber-400 to-orange-500' },
    { number: '2', text: t('step2'), color: 'from-blue-400 to-indigo-500' },
    { number: '3', text: t('step3'), color: 'from-emerald-400 to-teal-500' },
  ];

  return (
    <section className="relative py-24 lg:py-40 overflow-hidden bg-slate-900">
      {/* Prime Dark Background */}
      <div className="absolute inset-0 bg-[#0A0F1A]" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[160px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[140px] translate-y-1/4 -translate-x-1/4 pointer-events-none" />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="container mx-auto px-4 relative z-10 text-center">
        <div className="max-w-6xl mx-auto">
          {/* Label Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-white/10 backdrop-blur-md animate-fade-in">
            <Sparkles className="h-3 w-3 text-amber-300" />
            {t('badge')}
          </div>

          {/* Unified Prime Headline */}
          <h2 className="font-display font-black mb-12 text-white tracking-tight leading-[0.9] animate-fade-in uppercase">
            <span className="text-2xl md:text-3xl lg:text-4xl block mb-3 opacity-60">
              {t('title').split('.')[0]}.
            </span>
            <span className="text-5xl md:text-6xl lg:text-7xl block leading-[0.85] tracking-[-0.05em] text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200 filter drop-shadow-2xl">
              {t('title').split('.')[1]?.trim() || ''}
            </span>
          </h2>

          <p className="text-white/40 max-w-2xl mx-auto text-base md:text-lg font-medium leading-relaxed opacity-60 mb-16 lg:mb-24 animate-fade-in">
            {t('subtitle')}
          </p>

          {/* Steps - Prime Bento Style */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mb-20 max-w-5xl mx-auto">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="group relative bg-white/5 backdrop-blur-sm rounded-[2.5rem] p-8 border border-white/10 hover:bg-white/10 transition-all duration-500 hover:-translate-y-2"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div
                  className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${step.color} text-slate-900 font-black text-xl flex items-center justify-center mx-auto mb-6 shadow-lg group-hover:scale-110 transition-transform duration-500`}
                >
                  {step.number}
                </div>
                <span className="text-white text-lg font-bold tracking-tight">{step.text}</span>
              </div>
            ))}
          </div>

          {/* Stats - Massive Minimalist */}
          <div className="flex flex-col md:flex-row justify-center items-center gap-12 md:gap-24 mb-20 bg-white/5 backdrop-blur-xl py-12 px-16 rounded-[3rem] border border-white/10 max-w-4xl mx-auto">
            <div className="text-center group">
              <div className="text-6xl md:text-8xl font-black text-white mb-2 tracking-tighter group-hover:text-amber-200 transition-colors">
                {t('stats.time')}
              </div>
              <div className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em]">
                {t('stats.timeLabel')}
              </div>
            </div>
            <div className="hidden md:block w-px h-24 bg-white/10" />
            <div className="text-center group">
              <div className="text-6xl md:text-8xl font-black text-white mb-2 tracking-tighter group-hover:text-amber-200 transition-colors">
                {t('stats.noForms')}
              </div>
              <div className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em]">
                {t('stats.noFormsLabel')}
              </div>
            </div>
          </div>

          {/* Call-to-Action */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            {telHref && (
              <div className="relative group/btn">
                <div className="absolute -inset-4 bg-white/10 rounded-[2.5rem] animate-ping-slow opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                <div className="absolute -inset-2 bg-white/5 rounded-[2.5rem] animate-pulse-slow" />

                <a href={telHref} className="relative block">
                  <Button
                    size="xl"
                    className="h-20 px-14 text-xl font-bold bg-white text-slate-900 hover:bg-slate-50 rounded-[2rem] shadow-2xl transition-all hover:scale-105 border-0"
                  >
                    <div className="relative mr-4 bg-slate-900/5 p-2 rounded-lg">
                      <Phone className="h-6 w-6 text-slate-900 animate-wiggle" />
                      <div className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full animate-ping-slow" />
                    </div>
                    {t('cta')}
                  </Button>
                </a>
              </div>
            )}

            {whatsapp && (
              <a href={whatsapp} className="inline-block">
                <Button
                  size="xl"
                  variant="outline"
                  className="h-20 px-14 text-xl font-bold bg-transparent backdrop-blur-md border-2 border-white/20 text-white hover:bg-white/10 rounded-[2rem] transition-all hover:scale-105"
                >
                  <MessageCircle className="h-6 w-6 mr-4 text-emerald-400" />
                  {t('whatsappCta')}
                </Button>
              </a>
            )}
          </div>

          {/* Trust Indicators */}
          <div className="mt-20 flex flex-wrap justify-center gap-8 text-white/40 font-bold uppercase tracking-widest text-[10px]">
            <div className="flex items-center gap-2 group">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 group-hover:scale-125 transition-transform" />
              <span>{t('noStress')}</span>
            </div>
            <div className="flex items-center gap-2 group">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 group-hover:scale-125 transition-transform" />
              <span>{t('noWaiting')}</span>
            </div>
            <div className="flex items-center gap-2 group">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 group-hover:scale-125 transition-transform" />
              <span>{t('noForms')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
