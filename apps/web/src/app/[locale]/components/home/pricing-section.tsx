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
      name: t('basic.name'),
      price: t('basic.price'),
      period: t('basic.period'),
      description: t('basic.description'),
      features: t.raw('basic.features') as string[],
    },
    {
      name: t('standard.name'),
      price: t('standard.price'),
      period: t('standard.period'),
      description: t('standard.description'),
      features: t.raw('standard.features') as string[],
      popular: true,
      popularLabel: t('standard.popular'),
    },
    {
      name: t('premium.name'),
      price: t('premium.price'),
      period: t('premium.period'),
      description: t('premium.description'),
      features: t.raw('premium.features') as string[],
    },
  ];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t('title')}</h2>
          <p className="text-[hsl(var(--muted-500))]">{t('subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`glass-card rounded-2xl p-6 relative card-lift ${
                plan.popular ? 'ring-2 ring-[hsl(var(--primary))]' : ''
              }`}
            >
              {plan.popular && plan.popularLabel && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="brand-gradient text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {plan.popularLabel}
                  </span>
                </div>
              )}
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-[hsl(var(--muted-500))]">{plan.period}</span>
                </div>
                <p className="text-sm text-[hsl(var(--muted-500))] mt-2">{plan.description}</p>
              </div>
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block">
                <Button variant={plan.popular ? 'default' : 'outline'} className="w-full">
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
