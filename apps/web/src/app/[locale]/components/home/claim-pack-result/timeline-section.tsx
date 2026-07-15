import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';

import { getTimelineCopy, getTimelineRange, type ResultCopy } from './result-copy';

export function TimelineSection({
  timeline,
  t,
}: Readonly<{ timeline: ClaimPack['timeline']; t: ResultCopy }>) {
  return (
    <section
      data-testid="claim-pack-timeline"
      aria-labelledby="claim-pack-timeline-heading"
      className="space-y-6 border-t border-[#001a33]/15 px-5 py-8 sm:px-8 lg:px-10 lg:py-10"
    >
      <div className="space-y-2">
        <h4 id="claim-pack-timeline-heading" className="text-2xl font-bold text-[#001a33]">
          {t('timeline.heading')}
        </h4>
        <p className="text-base leading-7 text-[#405267]">{t('timeline.intro')}</p>
      </div>
      <ol className="space-y-5">
        {timeline.milestones.map((milestone, index) => {
          const copy = getTimelineCopy(t, timeline.claimType, milestone.id);
          return (
            <li key={`${milestone.id}-${index}`} className="grid grid-cols-[2.5rem_1fr] gap-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#008f91] bg-[#e2f2ef] text-sm font-bold text-[#005f62]"
              >
                {index + 1}
              </span>
              <div className="space-y-1 border-b border-[#001a33]/15 pb-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-base font-bold text-[#001a33]">{copy.label}</p>
                  <p className="text-base font-semibold text-[#006f72]">
                    {getTimelineRange(t, milestone.estimatedRange)}
                  </p>
                </div>
                <p className="text-base leading-7 text-[#405267]">{copy.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
