import { OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsBadgeVariant } from './status';
import { toOpsTimelineTone } from './timeline';

type MembershipDocument = {
  id: string;
  name: string;
  url: string;
  createdAt?: string | Date;
};

type MembershipEvent = {
  id: string;
  type: string;
  date: string | Date;
  description?: string;
  actorName?: string;
};

export function toOpsStatus(status: string | null | undefined) {
  const safeStatus = status || 'none';
  return {
    label: safeStatus.replace(/_/g, ' ').toUpperCase(),
    variant: toOpsBadgeVariant(safeStatus),
  };
}

export function toOpsDocuments(docs: MembershipDocument[] | undefined): OpsDocument[] {
  if (!docs || !Array.isArray(docs)) return [];
  return docs.map(d => ({
    id: d.id,
    name: d.name,
    url: d.url,
    uploadedAt: d.createdAt,
  }));
}

export function toOpsTimelineEvents(events: MembershipEvent[] | undefined): OpsTimelineEvent[] {
  if (!events || !Array.isArray(events)) return [];
  return events.map(e => ({
    id: e.id,
    title: formatEventTitle(e.type),
    description: e.description,
    date: new Date(e.date).toLocaleString(),
    actorName: e.actorName,
    tone: toOpsTimelineTone(mapEventTypeToTone(e.type)),
  }));
}

function formatEventTitle(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function mapEventTypeToTone(type: string): string {
  if (['activated', 'renewed', 'upgraded'].includes(type)) return 'success';
  if (['cancelled', 'expired', 'suspended'].includes(type)) return 'danger';
  if (['payment_failed', 'past_due'].includes(type)) return 'warning';
  return 'neutral';
}
