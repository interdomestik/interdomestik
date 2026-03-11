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
  const trustCues = Array.isArray(t.raw('trustCues')) ? (t.raw('trustCues') as string[]) : [];

  return (
    <section className="relative z-20 -mt-10 pb-12">
      <div className="container mx-auto px-4">
        <div
          className={`glass shadow-premium rounded-3xl px-6 py-10 sm:px-12 ${
            stats.length === 3 ? 'max-w-4xl mx-auto' : 'max-w-5xl mx-auto'
          }`}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-12 md:gap-x-20 lg:gap-32">
            {stats.map(stat => (
              <div
                key={stat.label}
                className="min-w-[140px] text-center transition-transform duration-300 hover:-translate-y-1 group"
              >
                <div className="mb-2 text-4xl font-black tracking-tighter text-primary md:text-5xl">
                  {stat.value}
                </div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-800 transition-colors duration-300 group-hover:text-primary">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
          {trustCues.length > 0 ? (
            <div className="mt-8 border-t border-white/50 pt-5">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-slate-600">
                {t('trustCuesLabel')}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {trustCues.map(cue => (
                  <span
                    key={cue}
                    data-testid="trust-strip-cue-chip"
                    className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    {cue}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
