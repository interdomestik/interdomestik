import { Check, HelpCircle, X } from 'lucide-react';
import { ReactNode } from 'react';
import {
  CashVerificationDetailsDTO,
  VerificationTimelineEvent,
} from '@/features/admin/verification/server/types';
import { OpsAction, OpsDocument, OpsTimelineEvent } from '../types';
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

type VerificationActionContext = {
  status: CashVerificationDetailsDTO['status'];
  onApprove: () => void;
  onReject: () => void;
  onNeedsInfo: () => void;
  labels: {
    approve: string;
    reject: string;
    needsInfo: string;
  };
  icons?: {
    approve?: ReactNode;
    reject?: ReactNode;
    needsInfo?: ReactNode;
  };
};

export function getVerificationActions({
  status,
  onApprove,
  onReject,
  onNeedsInfo,
  labels,
  icons,
}: VerificationActionContext): { primary: OpsAction; secondary: OpsAction[] } | null {
  if (['succeeded', 'rejected'].includes(status)) {
    return null;
  }

  const primary: OpsAction = {
    id: 'approve',
    label: labels.approve,
    onClick: onApprove,
    variant: 'default',
    icon: icons?.approve,
    testId: 'ops-action-approve',
    // Example policy: can't approve if already approved (handled by null return above)
    // but maybe we want to show disabled? For now, following logic of VerificationDetailsDrawer
  };

  const secondary: OpsAction[] = [
    {
      id: 'needs_info',
      label: labels.needsInfo,
      onClick: onNeedsInfo,
      variant: 'outline',
      icon: icons?.needsInfo,
      testId: 'ops-action-needs-info',
    },
    {
      id: 'reject',
      label: labels.reject,
      onClick: onReject,
      variant: 'destructive',
      icon: icons?.reject,
      testId: 'ops-action-reject',
    },
  ];

  return { primary, secondary };
}
