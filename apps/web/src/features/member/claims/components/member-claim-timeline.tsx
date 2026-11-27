'use client';

import { OPS_TEST_IDS } from '@/components/ops/testids';
import type { OpsTimelineEvent } from '@/components/ops/types';
import { formatPilotDateTime, toPilotDateTimeAttribute } from '@/lib/utils/date';
import { useLocale, useTranslations } from 'next-intl';
import { DETAIL_CARD, DETAIL_HEADING, DETAIL_TERM } from './member-claim-detail-styles';

export function MemberClaimTimeline({ events }: Readonly<{ events: OpsTimelineEvent[] }>) {
  const t = useTranslations('claims.timeline');
  const locale = useLocale();

  return (
    <div className={`${DETAIL_CARD} space-y-5`} data-testid={OPS_TEST_IDS.TIMELINE.ROOT}>
      <h2 className={DETAIL_HEADING}>{t('title')}</h2>
      {events.length === 0 ? (
        <p className={DETAIL_TERM} data-testid={OPS_TEST_IDS.TIMELINE.EMPTY}>
          {t('empty')}
        </p>
      ) : (
        <ol className="ms-1.5 min-w-0 space-y-5 border-s-2 border-[hsl(var(--border-strong))] ps-5 forced-colors:border-[CanvasText]">
          {events.map(event => (
            <li
              key={event.id}
              className="relative min-w-0 space-y-1"
              data-testid={OPS_TEST_IDS.TIMELINE.ITEM}
            >
              <span
                aria-hidden="true"
                className="absolute -start-[27px] top-1.5 size-3 rounded-full border-2 border-primary bg-[hsl(var(--surface))] forced-colors:border-[CanvasText]"
              />
              <p className="font-semibold">{event.title}</p>
              <p className={DETAIL_TERM}>
                <time dateTime={toPilotDateTimeAttribute(event.date)}>
                  {formatPilotDateTime(event.date, locale, event.date)}
                </time>
              </p>
              {event.description ? (
                <p className="text-sm leading-6 whitespace-pre-line">{event.description}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
