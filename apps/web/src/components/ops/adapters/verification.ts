import {
  CashVerificationDetailsDTO,
  VerificationTimelineEvent,
} from '@/features/admin/verification/server/types';
import { OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsTimelineTone } from './timeline';

export function toOpsDocuments(docs: CashVerificationDetailsDTO['documents']): OpsDocument[] {
  return docs.map(d => ({
    id: d.id,
    name: d.name,
    url: d.url,
    uploadedAt: d.uploadedAt,
  }));
}

export function toOpsTimelineEvents(events: VerificationTimelineEvent[]): OpsTimelineEvent[] {
  return events.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    date: new Date(e.date).toLocaleString(), // Simple formatting, can be enhanced
    actorName: e.actorName,
    tone: toOpsTimelineTone(e.type),
  }));
}
