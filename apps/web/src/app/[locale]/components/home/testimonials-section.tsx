import { Quote, Star } from 'lucide-react';
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
    },
    {
      quote: t('stories.1.quote'),
      name: t('stories.1.name'),
      role: t('stories.1.role'),
      amount: t('stories.1.amount'),
      time: t('stories.1.time'),
    },
    {
      quote: t('stories.2.quote'),
      name: t('stories.2.name'),
      role: t('stories.2.role'),
      amount: t('stories.2.amount'),
      time: t('stories.2.time'),
    },
    {
      quote: t('stories.3.quote'),
      name: t('stories.3.name'),
      role: t('stories.3.role'),
      amount: t('stories.3.amount'),
      time: t('stories.3.time'),
    },
  ];

  return (
    <section className="py-16 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-display font-black mb-4 text-slate-900 tracking-tight">
            {t('title')}
          </h2>
          <p className="text-slate-500 text-lg font-medium">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {stories.map((story, index) => (
            <div
              key={index}
              className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 flex flex-col hover:shadow-2xl transition-shadow group"
            >
              {/* Quote Icon */}
              <div className="mb-4">
                <Quote className="h-8 w-8 text-primary/20" />
              </div>

              {/* Quote Text */}
              <p className="text-slate-600 text-sm leading-relaxed mb-6 flex-1">{story.quote}</p>

              {/* Result Badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                  {story.amount}
                </span>
                <span className="text-xs text-slate-400">në {story.time}</span>
              </div>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {story.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">{story.name}</p>
                  <p className="text-xs text-slate-500">{story.role}</p>
                </div>
                <div className="ml-auto flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
