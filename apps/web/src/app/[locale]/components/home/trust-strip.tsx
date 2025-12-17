import { flags } from '@/lib/flags';
import { useTranslations } from 'next-intl';

export function TrustStrip() {
  const t = useTranslations('trust');
  const slaEnabled = flags.responseSla;

  const stats = [
    { value: '1,200+', label: t('claimsProcessed') },
    { value: '€850K+', label: t('compensationWon') },
    { value: '94%', label: t('successRate') },
    ...(slaEnabled ? [{ value: '<24h', label: t('responseTime') }] : []),
  ];

  return (
    <section className="py-8 bg-[hsl(var(--surface-strong))] border-y">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-[hsl(var(--primary))]">
                {stat.value}
              </div>
              <div className="text-sm text-[hsl(var(--muted-500))]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
