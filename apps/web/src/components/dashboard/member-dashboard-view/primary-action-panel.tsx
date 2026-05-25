import { Check } from 'lucide-react';
import type { DashboardTranslator } from './types';

type PrimaryActionPanelProps = {
  locale: string;
  t: DashboardTranslator;
};

export function PrimaryActionPanel({ locale, t }: PrimaryActionPanelProps) {
  const benefits = [
    t('membershipValue.benefits.assistance'),
    t('membershipValue.benefits.activation'),
    t('membershipValue.benefits.cases'),
  ];

  return (
    <a
      aria-label={t('membershipValue.label')}
      href={`/${locale}/member/benefits`}
      className="flex items-center justify-between rounded-[1.25rem] bg-[#eef4ef] p-3 shadow-lg shadow-emerald-900/5 ring-1 ring-emerald-900/5 transition-all active:scale-[0.98] md:rounded-[1.5rem] md:p-6"
      data-testid="home-cta-benefits"
    >
      <div className="contents" data-testid="member-primary-action-panel">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-base font-extrabold tracking-tight text-[#0e5c2b] md:text-2xl">
            {t('membershipValue.price')}
          </h2>
          <ul className="mt-0.5 flex flex-col gap-1">
            {benefits.map(item => (
              <li
                key={item}
                className="flex items-center gap-1.5 text-[0.64rem] font-semibold text-[#0e5c2b] md:text-[0.8rem]"
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#d0e5d6] text-[#0e5c2b]">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative h-[76px] w-[112px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#0e5c2b] to-[#0a421e] p-3 text-white shadow-md md:h-[120px] md:w-[170px]">
          <div className="flex items-center gap-1.5 relative z-10">
            <span className="font-extrabold text-[0.38rem] tracking-wider uppercase md:text-[0.55rem]">
              <span className="font-bold mr-1">(i)</span>
              {t('header.brand')}
            </span>
          </div>
          <div className="absolute bottom-2 left-3 z-10">
            <p className="text-[0.44rem] font-bold uppercase tracking-wider text-white md:text-[0.6rem]">
              {t('membershipValue.cardTitle')}
            </p>
            <p className="text-[0.36rem] font-medium text-white/80 md:text-[0.5rem]">
              {t('membershipValue.cardSubtitle')}
            </p>
          </div>
          <div className="absolute -right-3 top-4 h-14 w-14 opacity-[0.15] md:top-6 md:h-20 md:w-20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
        </div>
      </div>
    </a>
  );
}
