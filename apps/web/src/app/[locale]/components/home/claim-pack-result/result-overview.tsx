import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { ArrowRight } from 'lucide-react';

import { Link } from '@/i18n/routing';

import { PRIMARY_ACTION_CLASS } from '../free-start-intake-shell/organizer-styles';
import type { ResultCopy } from './result-copy';

type Props = Readonly<{
  confidence: ClaimPack['confidence'];
  ctaHref: string;
  ctaLabel: string;
  t: ResultCopy;
}>;

export function ResultOverview({ confidence, ctaHref, ctaLabel, t }: Props) {
  return (
    <section className="grid border-y border-[#001a33]/15 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="min-w-0 space-y-4 bg-[#eaf1f4] px-5 py-7 sm:px-8 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#526274]">
          {t('preparation.eyebrow')}
        </p>
        <div data-testid="claim-pack-confidence-level" className="flex items-end gap-3">
          <span className="font-serif text-5xl leading-none text-[#001a33]">
            {confidence.score}
          </span>
          <span className="pb-1 text-base font-semibold text-[#405267]">/ 100</span>
        </div>
        <h4 className="text-xl font-bold text-[#001a33]">
          {t(`preparation.levels.${confidence.level}`)}
        </h4>
        <p className="text-base leading-7 text-[#405267]">{t('preparation.note')}</p>
      </div>
      <div
        data-testid="claim-pack-next-step"
        className="min-w-0 space-y-4 px-5 py-7 sm:px-8 lg:border-l lg:border-[#001a33]/15 lg:px-10"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#007f82]">
          {t('nextStep.eyebrow')}
        </p>
        <h4 className="text-2xl font-bold text-[#001a33]">{t('nextStep.heading')}</h4>
        <p className="text-base leading-7 text-[#405267]">
          {t(`nextStep.levels.${confidence.level}`)}
        </p>
        <Link href={ctaHref} className={`${PRIMARY_ACTION_CLASS} forced-colors:outline`}>
          {ctaLabel}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
