import { OpsTimeline } from '@/components/ops';
import { toOpsTimelineEvents } from '@/components/ops/adapters/verification';
import { useTranslations } from 'next-intl';
import { VerificationTimelineEvent } from '../server/types';

interface VerificationTimelineProps {
  timeline: VerificationTimelineEvent[];
}

export function VerificationTimeline({ timeline }: VerificationTimelineProps) {
  const t = useTranslations('admin.leads');
  const events = toOpsTimelineEvents(timeline);

  return <OpsTimeline title={t('drawer.timeline')} events={events} emptyLabel={t('empty_state')} />;
}
