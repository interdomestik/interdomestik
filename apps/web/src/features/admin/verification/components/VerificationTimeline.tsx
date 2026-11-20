import { OpsTimeline } from '@/components/ops';
import { toOpsTimelineEvents } from '@/components/ops/adapters/verification';
import { useTranslations } from 'next-intl';
import { VerificationTimelineEvent } from '../server/types';

interface VerificationTimelineProps {
  timeline: VerificationTimelineEvent[];
}

export function VerificationTimeline({ timeline }: VerificationTimelineProps) {
  const t = useTranslations('admin.leads');
  const events = toOpsTimelineEvents(timeline).map((event, index) => {
    const source = timeline[index];
    const actionKeys: Record<string, string> = {
      Approved: 'approved',
      Rejected: 'rejected',
      'Requested Info': 'needsInfo',
      Resubmitted: 'resubmitted',
    };
    let key: string;
    switch (source.type) {
      case 'created':
        key = 'created';
        break;
      case 'document_upload':
        key = 'documentUploaded';
        break;
      default:
        key = actionKeys[source.title] ?? 'updated';
    }
    return {
      ...event,
      title: t(`events.${key}`),
      description:
        source.type === 'created'
          ? t('events.cashRecorded', { name: source.actorName || t('events.unknownActor') })
          : event.description,
      actorName: source.actorName === 'Unknown' ? t('events.unknownActor') : event.actorName,
    };
  });

  return <OpsTimeline title={t('drawer.timeline')} events={events} emptyLabel={t('empty_state')} />;
}
