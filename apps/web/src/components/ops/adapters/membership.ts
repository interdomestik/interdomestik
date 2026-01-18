// Stub for Membership adapter
import { OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsBadgeVariant } from './status';

export function toOpsStatus(status: string) {
  return {
    label: status.toUpperCase(),
    variant: toOpsBadgeVariant(status),
  };
}

export function toOpsDocuments(docs: any[]): OpsDocument[] {
  return [];
}

export function toOpsTimelineEvents(events: any[]): OpsTimelineEvent[] {
  return [];
}
