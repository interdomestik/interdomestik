import { OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsBadgeVariant } from './status';
import { toOpsTimelineTone } from './timeline';

// Stub types for now until we have actual Claims DTOs imported
type ClaimDocument = {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
};

type ClaimEvent = {
  id: string;
  action: string;
  note?: string;
  createdAt: string;
  performedBy?: string;
  type?: string;
};

type ClaimStatus = string;

export function toOpsDocuments(docs: ClaimDocument[]): OpsDocument[] {
  return docs.map(d => ({
    id: d.id,
    name: d.fileName,
    url: d.fileUrl,
    uploadedAt: d.uploadedAt,
  }));
}

export function toOpsTimelineEvents(events: ClaimEvent[]): OpsTimelineEvent[] {
  return events.map(e => ({
    id: e.id,
    title: e.action,
    description: e.note,
    date: new Date(e.createdAt).toLocaleString(),
    actorName: e.performedBy,
    tone: toOpsTimelineTone(e.type || 'neutral'),
  }));
}

export function toOpsStatus(status: ClaimStatus) {
  return {
    label: status.replace(/_/g, ' ').toUpperCase(),
    variant: toOpsBadgeVariant(status),
  };
}
