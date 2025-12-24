import { Quote, Sparkles, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function TestimonialsSection() {
  const t = useTranslations('testimonials');

  const stories = [
    {
      quote: t('stories.0.quote'),
      name: t('stories.0.name'),
      role: t('stories.0.role'),
      amount: t('stories.0.amount'),
      time: t('stories.0.time'),
      color: 'from-emerald-400 to-teal-500',
    },
    {
      quote: t('stories.1.quote'),
      name: t('stories.1.name'),
      role: t('stories.1.role'),
      amount: t('stories.1.amount'),
      time: t('stories.1.time'),
      color: 'from-blue-400 to-indigo-500',
    },
    {
      quote: t('stories.2.quote'),
      name: t('stories.2.name'),
      role: t('stories.2.role'),
      amount: t('stories.2.amount'),
      time: t('stories.2.time'),
      color: 'from-purple-400 to-fuchsia-500',
    },
    {
      quote: t('stories.3.quote'),
      name: t('stories.3.name'),
      role: t('stories.3.role'),
      amount: t('stories.3.amount'),
      time: t('stories.3.time'),
      color: 'from-amber-400 to-orange-500',
    },
  ];

  return (
    <section className="py-24 lg:py-40 relative overflow-hidden bg-white">
      {/* Background Decorative Elements */}
      <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[140px] -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px] translate-y-1/4 translate-x-1/4 pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16 lg:mb-24 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-slate-200/50 shadow-sm transition-all text-balance">
            <Quote className="h-3 w-3 text-primary" />
            {t('title')}
          </div>
          <h2 className="font-display font-black mb-12 text-slate-900 tracking-tight leading-[0.9] animate-fade-in uppercase">
            <span className="text-2xl md:text-3xl lg:text-4xl block mb-3 text-slate-800 font-bold">
              {t('mainHeading1')}
            </span>
            <span className="text-5xl md:text-6xl lg:text-7xl block leading-[0.85] tracking-[-0.05em] text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              {t('mainHeading2')}
            </span>
          </h2>
          <p className="text-slate-800 max-w-2xl mx-auto text-base md:text-lg font-medium leading-relaxed">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {stories.map((story, index) => (
            <div
              key={index}
              className="group relative bg-white rounded-[2.5rem] p-8 transition-all duration-500 hover:-translate-y-2 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_40px_80px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Feature Glow */}
              <div
                className={`absolute -right-10 -top-10 w-40 h-40 bg-gradient-to-br ${story.color} opacity-0 group-hover:opacity-[0.05] blur-3xl transition-opacity duration-700`}
              />

              <div className="relative z-10 flex flex-col h-full">
                {/* Quote Icon & Stars */}
                <div className="flex items-center justify-between mb-8">
                  <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-white group-hover:border-primary/20 transition-colors">
                    <Quote className="h-5 w-5 text-slate-200 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>

                {/* Quote Text */}
                <blockquote className="text-slate-800 text-[1.05rem] font-medium leading-[1.6] mb-8 flex-1 italic relative">
                  "{story.quote}"
                </blockquote>

                {/* The "Win" / Result Badge */}
                <div className="mb-8">
                  <div className="inline-flex flex-col gap-1">
                    <div
                      className={`px-4 py-2 rounded-2xl bg-gradient-to-r ${story.color} text-white text-lg font-black tracking-tight shadow-md group-hover:scale-105 transition-transform duration-500`}
                    >
                      {story.amount}
                    </div>
                    <span className="text-[10px] text-slate-800 font-bold uppercase tracking-widest ml-1">
                      {t('recoveredIn')} {story.time}
                    </span>
                  </div>
                </div>

                {/* Author Info */}
                <div className="flex items-center gap-4 pt-6 border-t border-slate-50">
                  <div
                    className={`h-12 w-12 rounded-full bg-gradient-to-br ${story.color} flex items-center justify-center text-white font-black text-sm shadow-sm ring-4 ring-white`}
                  >
                    {story.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm tracking-tight">
                      {story.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-slate-800">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {story.role}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
