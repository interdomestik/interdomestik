import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Plan = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  popularLabel?: string;
};

export function PricingSection() {
  const t = useTranslations('pricing');

  const plans: Plan[] = [
    {
      name: t('standard.name'),
      price: t('standard.price'),
      period: t('standard.period'),
      description: t('standard.description'),
      features: [
        t('standard.features.0'),
        t('standard.features.1'),
        t('standard.features.2'),
        t('standard.features.3'),
        t('standard.features.4'),
        t('standard.features.5'),
      ],
      popular: true,
      popularLabel: t('standard.popular'),
    },
    {
      name: t('family.name'),
      price: t('family.price'),
      period: t('family.period'),
      description: t('family.description'),
      features: [
        t('family.features.0'),
        t('family.features.1'),
        t('family.features.2'),
        t('family.features.3'),
      ],
    },
    {
      name: t('business.name'),
      price: t('business.price'),
      period: t('business.period'),
      description: t('business.description'),
      features: [
        t('business.features.0'),
        t('business.features.1'),
        t('business.features.2'),
        t('business.features.3'),
        t('business.features.4'),
      ],
    },
  ];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t('title')}</h2>
          <p className="text-[hsl(var(--muted-500))]">{t('subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`bg-white rounded-3xl p-10 relative transition-all duration-300 border-2 ${
                plan.popular
                  ? 'border-primary shadow-2xl shadow-primary/10 scale-105 z-10'
                  : 'border-slate-100 shadow-xl'
              }`}
            >
              {plan.popular && plan.popularLabel && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                  <span className="bg-primary text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                    {plan.popularLabel}
                  </span>
                </div>
              )}
              <div className="text-center mb-8">
                <h3 className="text-2xl font-black mb-3 text-slate-900">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-black text-slate-900 tracking-tighter">
                    {plan.price}
                  </span>
                  <span className="text-slate-400 font-bold">{plan.period}</span>
                </div>
                <p className="text-sm font-semibold text-slate-500 mt-3">{plan.description}</p>
              </div>
              <ul className="space-y-4 mb-10">
                {plan.features.map(feature => (
                  <li
                    key={feature}
                    className="flex items-center gap-3 text-[15px] font-medium text-slate-600"
                  >
                    <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block">
                <Button
                  size="xl"
                  variant={plan.popular ? 'default' : 'outline'}
                  className={`w-full h-14 text-lg font-bold rounded-2xl ${
                    plan.popular ? 'shadow-lg shadow-primary/30' : ''
                  }`}
                >
                  {t('cta')}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
