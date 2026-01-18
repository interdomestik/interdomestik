import { OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsBadgeVariant } from './status';
import { toOpsTimelineTone } from './timeline';

// Types from features/claims/tracking/types.ts
type ClaimTrackingDocument = {
  id: string;
  name: string;
  category: string;
  createdAt: Date | string;
  fileType: string;
  fileSize: number;
  url?: string; // Optional URL for display
};

type ClaimTimelineEvent = {
  id: string;
  date: Date | string;
  statusFrom: string | null;
  statusTo: string;
  labelKey: string;
  note: string | null;
  isPublic: boolean;
};

type ClaimStatus = string;

export function toOpsDocuments(docs: ClaimTrackingDocument[]): OpsDocument[] {
  return docs.map(d => ({
    id: d.id,
    name: d.name,
    url: d.url || `/api/documents/${d.id}/download?disposition=inline`, // Fallback or standard route
    uploadedAt: d.createdAt,
  }));
}

export function toOpsTimelineEvents(events: ClaimTimelineEvent[]): OpsTimelineEvent[] {
  return events.map(e => ({
    id: e.id,
    title: e.labelKey, // In real app, translate this using t(e.labelKey) before passing or handle in component
    description: e.note || undefined,
    date: new Date(e.date).toLocaleString(),
    tone: toOpsTimelineTone('neutral'), // Map status changes to tone if needed
  }));
}

export function toOpsStatus(status: ClaimStatus) {
  return {
    label: status.replace(/_/g, ' ').toUpperCase(),
    variant: toOpsBadgeVariant(status),
  };
}
