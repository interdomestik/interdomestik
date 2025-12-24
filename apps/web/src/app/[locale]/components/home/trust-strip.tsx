import { flags } from '@/lib/flags';
import { useTranslations } from 'next-intl';

export function TrustStrip() {
  const t = useTranslations('trust');
  const slaEnabled = flags.responseSla;

  const stats = [
    { value: t('activeMembersValue'), label: t('activeMembers') },
    { value: t('memberSavingsValue'), label: t('memberSavings') },
    { value: t('successRateValue'), label: t('successRate') },
    ...(slaEnabled ? [{ value: t('hotlineResponseValue'), label: t('hotlineResponse') }] : []),
  ];

  return (
    <section className="relative z-20 -mt-10 pb-12">
      <div className="container mx-auto px-4">
        <div
          className={`glass shadow-premium rounded-3xl py-10 px-6 sm:px-12 flex flex-wrap justify-center items-center gap-y-12 gap-x-8 md:gap-x-20 lg:gap-32 ${
            stats.length === 3 ? 'max-w-4xl mx-auto' : 'max-w-5xl mx-auto'
          }`}
        >
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center min-w-[140px] group transition-transform hover:-translate-y-1 duration-300"
            >
              <div className="text-4xl md:text-5xl font-black text-primary tracking-tighter mb-2">
                {stat.value}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-slate-800 group-hover:text-primary transition-colors duration-300">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
