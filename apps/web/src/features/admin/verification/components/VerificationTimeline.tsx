import { useTranslations } from 'next-intl';
import { OpsTimeline } from '@/components/ops';
import { VerificationTimelineEvent } from '../server/types';

interface VerificationTimelineProps {
  timeline: VerificationTimelineEvent[];
}

export function VerificationTimeline({ timeline }: VerificationTimelineProps) {
  const t = useTranslations('admin.leads');
  const events = timeline.map(event => ({
    id: event.id,
    title: event.title,
    description: event.description,
    date: typeof event.date === 'string' ? event.date : event.date.toISOString(),
    actorName: event.actorName,
  }));

  return <OpsTimeline title={t('drawer.timeline')} events={events} emptyLabel={t('empty_state')} />;
}
