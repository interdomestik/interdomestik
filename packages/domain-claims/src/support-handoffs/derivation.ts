import type { ClaimStatus } from '@interdomestik/database/constants';

import type { SupportHandoffTrustRisk, SupportHandoffUrgency } from './types';

type WaitingOn = 'member' | 'staff' | 'system' | null;

type StagePolicy = {
  stuckThreshold: number;
  slaThreshold: number;
  requiresStaff: boolean;
  waitingOn: WaitingOn;
};

const STAGE_POLICIES: Record<ClaimStatus, StagePolicy> = {
  draft: { stuckThreshold: 7, slaThreshold: 0, requiresStaff: false, waitingOn: 'member' },
  submitted: { stuckThreshold: 2, slaThreshold: 3, requiresStaff: true, waitingOn: 'staff' },
  submitted_to_airline: {
    stuckThreshold: 7,
    slaThreshold: 14,
    requiresStaff: true,
    waitingOn: 'staff',
  },
  verification: { stuckThreshold: 5, slaThreshold: 7, requiresStaff: true, waitingOn: 'member' },
  evaluation: { stuckThreshold: 3, slaThreshold: 5, requiresStaff: true, waitingOn: 'staff' },
  negotiation: { stuckThreshold: 7, slaThreshold: 14, requiresStaff: true, waitingOn: 'staff' },
  court: { stuckThreshold: 30, slaThreshold: 0, requiresStaff: true, waitingOn: 'staff' },
  resolved: { stuckThreshold: 0, slaThreshold: 0, requiresStaff: false, waitingOn: null },
  rejected: { stuckThreshold: 0, slaThreshold: 0, requiresStaff: false, waitingOn: null },
};

export type SupportHandoffDerivationInput =
  | {
      claim: {
        status: ClaimStatus | null;
        staffId: string | null;
        createdAt?: Date | string | null;
        updatedAt?: Date | string | null;
        statusUpdatedAt?: Date | string | null;
      };
      now?: Date;
    }
  | {
      claim?: null;
      now?: Date;
    };

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDaysInStage(args: {
  createdAt?: Date | string | null;
  now?: Date;
  statusUpdatedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}) {
  const now = args.now ?? new Date();
  const anchor =
    normalizeDate(args.statusUpdatedAt) ??
    normalizeDate(args.updatedAt) ??
    normalizeDate(args.createdAt);

  if (!anchor) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86_400_000));
}

export function deriveSupportHandoffSignals(input: SupportHandoffDerivationInput): {
  urgency: SupportHandoffUrgency;
  trustRisk: SupportHandoffTrustRisk;
} {
  if (!input.claim?.status) {
    return { urgency: 'normal', trustRisk: 'low' };
  }

  const policy = STAGE_POLICIES[input.claim.status];
  const daysInStage = getDaysInStage({ ...input.claim, now: input.now });
  const isTerminal = input.claim.status === 'resolved' || input.claim.status === 'rejected';
  const isMemberActionRequired = input.claim.status === 'draft' || policy.waitingOn === 'member';
  const isStuck = policy.stuckThreshold > 0 && daysInStage > policy.stuckThreshold;
  const hasSlaBreach = policy.slaThreshold > 0 && daysInStage > policy.slaThreshold;
  const isUnassignedStaffRequired = policy.requiresStaff && !input.claim.staffId;

  if (isTerminal || isMemberActionRequired) {
    return { urgency: 'low', trustRisk: 'informational' };
  }

  if (hasSlaBreach || isUnassignedStaffRequired) {
    return { urgency: 'critical', trustRisk: 'high' };
  }

  if (isStuck || policy.waitingOn === 'staff') {
    return { urgency: 'high', trustRisk: 'medium' };
  }

  return { urgency: 'normal', trustRisk: 'low' };
}
