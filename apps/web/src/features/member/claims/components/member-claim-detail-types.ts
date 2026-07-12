import type {
  ClaimMatterAllowanceDto,
  ClaimProgressSummaryDto,
  ClaimRecoveryDecisionDto,
  ClaimTrackingDetailDto,
  ClaimTrackingDocument,
  ClaimTimelineEvent,
} from '@/features/claims/tracking/types';
import type { SerializedVaultConsentDisplay } from '@/features/claims/tracking/server/member-vault-consent-serialization';
import type { SerializedCaseCompanionNextStep } from './CaseCompanionNextStepCard';

type SerializedDocument = Omit<ClaimTrackingDocument, 'createdAt'> & {
  createdAt: ClaimTrackingDocument['createdAt'] | string;
};

type SerializedTimelineEvent = Omit<ClaimTimelineEvent, 'date'> & {
  date: ClaimTimelineEvent['date'] | string;
};

type SerializedMatterAllowance = Omit<ClaimMatterAllowanceDto, 'windowStart' | 'windowEnd'> & {
  windowStart: ClaimMatterAllowanceDto['windowStart'] | string;
  windowEnd: ClaimMatterAllowanceDto['windowEnd'] | string;
};

type SerializedProgressSummary = Omit<ClaimProgressSummaryDto, 'latestUpdateAt'> & {
  latestUpdateAt: ClaimProgressSummaryDto['latestUpdateAt'] | string;
};

export type MemberClaimDetailOpsClaim = Omit<
  ClaimTrackingDetailDto,
  | 'createdAt'
  | 'updatedAt'
  | 'documents'
  | 'timeline'
  | 'matterAllowance'
  | 'recoveryDecision'
  | 'progressSummary'
  | 'caseCompanionNextStep'
  | 'vaultConsentDisplay'
> & {
  createdAt: ClaimTrackingDetailDto['createdAt'] | string;
  updatedAt: ClaimTrackingDetailDto['updatedAt'] | string | null;
  documents: SerializedDocument[];
  timeline: SerializedTimelineEvent[];
  progressSummary: SerializedProgressSummary;
  caseCompanionNextStep: SerializedCaseCompanionNextStep;
  matterAllowance?: SerializedMatterAllowance | null;
  recoveryDecision?: ClaimRecoveryDecisionDto | null;
  vaultConsentDisplay: SerializedVaultConsentDisplay;
};
