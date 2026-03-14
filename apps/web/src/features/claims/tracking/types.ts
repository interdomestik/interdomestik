import type { ClaimStatus } from '@interdomestik/database/constants';
import type { ClaimSlaPhase } from '../policy';

export interface ClaimMatterAllowanceDto {
  allowanceTotal: number;
  consumedCount: number;
  remainingCount: number;
  windowStart: Date;
  windowEnd: Date;
}

export interface ClaimRecoveryDecisionDto {
  status: 'accepted' | 'declined';
  title: string;
  description: string | null;
}

export interface ClaimTrackingDetailDto {
  id: string;
  publicId?: string; // For public link if exists
  title: string;
  status: ClaimStatus;
  slaPhase: ClaimSlaPhase;
  statusLabelKey: string;
  createdAt: Date;
  updatedAt: Date | null;
  description: string | null;
  amount: string | null;
  currency: string;

  // Relations
  documents: ClaimTrackingDocument[];
  timeline: ClaimTimelineEvent[];

  // Context
  canShare: boolean; // If allowed to generate public link
  matterAllowance?: ClaimMatterAllowanceDto | null;
  recoveryDecision?: ClaimRecoveryDecisionDto | null;
}

export interface ClaimTrackingDocument {
  id: string;
  name: string;
  category: string; // 'evidence' | 'correspondence' etc
  createdAt: Date;
  // No file path returned to client if not needed, or secure url
  fileType: string;
  fileSize: number;
}

export interface ClaimTimelineEvent {
  id: string;
  date: Date;
  statusFrom: string | null;
  statusTo: string;
  labelKey: string; // Translatable key for the event
  note: string | null; // Public safe note
  isPublic: boolean;
}

export interface PublicClaimStatusDto {
  claimId: string; // masked or public ID
  status: ClaimStatus;
  statusLabelKey: string;
  lastUpdatedAt: Date;
  nextStepKey: string; // Generic text about what happens next
}
