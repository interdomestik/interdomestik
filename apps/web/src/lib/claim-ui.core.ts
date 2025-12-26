import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  CheckCircle2,
  FileCheck,
  FileText,
  Gavel,
  History,
  Scale,
  type LucideIcon,
} from 'lucide-react';

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const CLAIM_STATUS_BADGE_VARIANTS: Record<ClaimStatus, BadgeVariant> = {
  draft: 'outline',
  submitted: 'secondary',
  verification: 'secondary',
  evaluation: 'default',
  negotiation: 'default',
  court: 'default',
  resolved: 'default',
  rejected: 'destructive',
};

export function getClaimStatusBadgeVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return 'outline';

  // Back-compat for any legacy status values.
  if (status === 'processing') return 'default';

  if ((CLAIM_STATUSES as readonly string[]).includes(status)) {
    return CLAIM_STATUS_BADGE_VARIANTS[status as ClaimStatus];
  }

  return 'outline';
}

const STAFF_CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  verification: 'In Verification',
  evaluation: 'Evaluation',
  negotiation: 'Negotiation',
  court: 'Court/Legal',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

export function getStaffClaimStatusLabel(status: ClaimStatus): string {
  return STAFF_CLAIM_STATUS_LABELS[status];
}

export type ClaimTimelinePhaseId = Exclude<ClaimStatus, 'draft' | 'rejected'>;

export const CLAIM_TIMELINE_PHASES: readonly {
  id: ClaimTimelinePhaseId;
  label: string;
  description: string;
  icon: LucideIcon;
  optional?: boolean;
}[] = [
  {
    id: 'submitted',
    label: 'Submission',
    description: 'Claim received',
    icon: FileText,
  },
  {
    id: 'verification',
    label: 'Verification',
    description: 'Checking details',
    icon: FileCheck,
  },
  {
    id: 'evaluation',
    label: 'Evaluation',
    description: 'Assessing value',
    icon: Scale,
  },
  {
    id: 'negotiation',
    label: 'Negotiation',
    description: 'Offer sent',
    icon: History,
  },
  {
    id: 'court',
    label: 'Court',
    description: 'Legal proceedings',
    icon: Gavel,
    optional: true,
  },
  {
    id: 'resolved',
    label: 'Resolution',
    description: 'Final decision',
    icon: CheckCircle2,
  },
];
