'use client';

import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { useTranslations } from 'next-intl';

import { EvidenceSection } from './claim-pack-result/evidence-section';
import { LetterSection } from './claim-pack-result/letter-section';
import { ResultOverview } from './claim-pack-result/result-overview';
import { TimelineSection } from './claim-pack-result/timeline-section';

export type ClaimPackResultProps = Readonly<{
  ctaHref?: string;
  ctaLabel?: string;
  pack: ClaimPack;
}>;

export function ClaimPackResult({ ctaHref, ctaLabel, pack }: ClaimPackResultProps) {
  const t = useTranslations('freeStart.result');
  const resolvedHref = ctaHref ?? pack.recommendedNextStep.ctaHref;
  const resolvedLabel = ctaLabel ?? t('nextStep.defaultCta');

  return (
    <article
      data-testid="claim-pack-result"
      aria-labelledby="claim-pack-result-heading"
      className="overflow-hidden rounded-[2rem] border border-[#001a33]/15 bg-[#fffdf9] shadow-[0_24px_70px_rgba(0,26,51,0.08)]"
    >
      <header className="space-y-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#007f82]">{t('badge')}</p>
        <h3
          id="claim-pack-result-heading"
          className="max-w-3xl font-serif text-3xl leading-tight text-[#001a33] sm:text-4xl"
        >
          {t('heading')}
        </h3>
        <p className="max-w-3xl text-base leading-7 text-[#405267]">{t('body')}</p>
      </header>
      <ResultOverview
        confidence={pack.confidence}
        ctaHref={resolvedHref}
        ctaLabel={resolvedLabel}
        t={t}
      />
      <EvidenceSection checklist={pack.evidenceChecklist} t={t} />
      <LetterSection letter={pack.letter} t={t} />
      <TimelineSection timeline={pack.timeline} t={t} />
      <p className="border-t border-[#001a33]/15 px-5 py-6 text-base leading-7 text-[#405267] sm:px-8 lg:px-10">
        {t('disclaimer')}
      </p>
    </article>
  );
}
