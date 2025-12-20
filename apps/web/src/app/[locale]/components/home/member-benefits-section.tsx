import { Calculator, Gift, Headphones, MessageSquare, Phone, ScrollText } from 'lucide-react';
import { useTranslations } from 'next-intl';

const benefitsConfig = [
  { icon: Phone, key: 'hotline', color: 'bg-amber-50 text-amber-600' },
  { icon: MessageSquare, key: 'voiceClaim', color: 'bg-green-50 text-green-600' },
  { icon: ScrollText, key: 'legalConsult', color: 'bg-blue-50 text-blue-600' },
  { icon: Calculator, key: 'calculator', color: 'bg-purple-50 text-purple-600' },
  { icon: Gift, key: 'partnerDiscounts', color: 'bg-pink-50 text-pink-600' },
  { icon: Headphones, key: 'guides', color: 'bg-indigo-50 text-indigo-600' },
];

export function MemberBenefitsSection() {
  const t = useTranslations('memberBenefits');

  return (
    <section className="py-16 lg:py-24 bg-slate-50/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-display font-black mb-4 text-slate-900 tracking-tight">
            {t('title')}
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto text-lg font-medium">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {benefitsConfig.map((benefit, index) => (
            <div
              key={benefit.key}
              className="group bg-white rounded-3xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex items-start gap-5">
                <div
                  className={`h-14 w-14 rounded-2xl ${benefit.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}
                >
                  <benefit.icon className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-black text-slate-900">
                      {t(`${benefit.key}.title`)}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {t(`${benefit.key}.highlight`)}
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {t(`${benefit.key}.description`)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
