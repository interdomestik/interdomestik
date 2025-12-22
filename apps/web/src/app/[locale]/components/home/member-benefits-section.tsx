import { Gift, Headphones, MessageSquare, Phone, ScrollText, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

const benefitsConfig = [
  {
    icon: Phone,
    key: 'hotline',
    color: 'from-orange-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-500/10',
  },
  {
    icon: MessageSquare,
    key: 'voiceClaim',
    color: 'from-emerald-400 via-green-500 to-green-600',
    iconBg: 'bg-emerald-500/10',
  },
  {
    icon: ScrollText,
    key: 'legalConsult',
    color: 'from-blue-500 via-indigo-600 to-blue-700',
    iconBg: 'bg-blue-500/10',
  },
  {
    icon: Gift,
    key: 'partnerDiscounts',
    color: 'from-pink-500 via-rose-600 to-red-500',
    iconBg: 'bg-pink-500/10',
  },
  {
    icon: Headphones,
    key: 'guides',
    color: 'from-violet-500 via-purple-600 to-indigo-600',
    iconBg: 'bg-indigo-500/10',
  },
];

export function MemberBenefitsSection() {
  const t = useTranslations('memberBenefits');

  return (
    <section className="py-24 lg:py-40 relative overflow-hidden bg-white">
      {/* Prime Decorative Elements */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px] -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-50" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[120px] translate-y-1/4 -translate-x-1/4 pointer-events-none opacity-50" />

      <div className="container mx-auto px-4 relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-slate-200/50 shadow-sm animate-fade-in text-balance">
          <Sparkles className="h-3 w-3 text-primary" />
          {t('title')}
        </div>
        <h2 className="font-display font-black mb-12 text-slate-900 tracking-tight leading-[0.9] animate-fade-in uppercase">
          <span className="text-2xl md:text-3xl lg:text-4xl block mb-3 opacity-60">
            Mbrojtje që ju
          </span>
          <span className="text-5xl md:text-6xl lg:text-7xl block leading-[0.85] tracking-[-0.05em] text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
            përket vetëm juve.
          </span>
        </h2>
        <p className="text-slate-500 max-w-2xl mx-auto text-base md:text-lg font-medium leading-relaxed opacity-60 mb-16 lg:mb-24 animate-fade-in">
          {t('subtitle')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 lg:gap-6 max-w-7xl mx-auto">
          {benefitsConfig.map((benefit, index) => (
            <div
              key={benefit.key}
              className={`group relative bg-white rounded-[2.5rem] p-8 lg:p-10 transition-all duration-500 hover:-translate-y-2 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_30px_60px_rgba(0,0,0,0.08)] flex flex-col justify-between overflow-hidden text-left ${
                index === 0 ? 'md:col-span-4' : index === 1 ? 'md:col-span-2' : 'md:col-span-2'
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Dynamic Glow Background */}
              <div
                className={`absolute -right-20 -top-20 w-64 h-64 bg-gradient-to-br ${benefit.color} opacity-0 group-hover:opacity-[0.07] blur-3xl transition-opacity duration-700`}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-10">
                  <div
                    className={`h-16 w-16 rounded-2xl ${benefit.iconBg} flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 border border-white/50 shadow-sm`}
                  >
                    <benefit.icon className="h-8 w-8 text-slate-900" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-900 text-[9px] font-black uppercase tracking-widest shadow-sm group-hover:bg-white group-hover:border-primary/20 transition-colors">
                    {t(`${benefit.key}.highlight`)}
                  </span>
                </div>

                <div className="max-w-[85%]">
                  <h3 className="text-2xl md:text-3xl font-display font-black text-slate-900 tracking-tighter leading-none mb-4">
                    {t(`${benefit.key}.title`)}
                  </h3>
                  <p className="text-slate-500 text-base md:text-lg font-medium leading-snug opacity-70 group-hover:opacity-100 transition-opacity">
                    {t(`${benefit.key}.description`)}
                  </p>
                </div>
              </div>

              {/* Decorative Shine */}
              <div className="mt-10 flex justify-end">
                <div className="h-10 w-10 rounded-full border border-slate-50 flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/5 transition-all duration-500 shadow-sm">
                  <Sparkles className="h-4 w-4 text-slate-200 group-hover:text-primary transition-colors" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
