import type { ClaimStatus } from '@interdomestik/database/constants';
import { z } from 'zod';

import { RECOVERY_DECLINE_REASON_CODES } from '../staff-claims/types';
import { claimStatusSchema } from '../validators/claims';
import type { RecoveryPrerequisite } from './change-status-recovery';
import type { ClaimTransitionRejectionReason } from './transition-guard';

const statusInputFields = {
  claimId: z.string().min(1),
  toStatus: claimStatusSchema.shape.status,
  note: z.string().optional(),
  isPublicNote: z.boolean().default(true),
  declineReasonCode: z.enum(RECOVERY_DECLINE_REASON_CODES).optional(),
  decisionExplanation: z.string().optional(),
  allowanceOverrideReason: z.string().optional(),
};

/** The action checks shape. The command bounds the note after trimming it. */
export const changeClaimStatusInputSchema = z.strictObject(statusInputFields);

export const changeClaimStatusCommandSchema = z.strictObject({
  ...statusInputFields,
  claimId: z.string().trim().min(1),
  note: z.string().trim().max(2000).optional(),
  decisionExplanation: z.string().trim().optional(),
  allowanceOverrideReason: z.string().trim().optional(),
});

export type StatusInput = z.output<typeof changeClaimStatusCommandSchema>;

export type ChangeClaimStatusCode =
  | 'not_found'
  | 'forbidden_role'
  | 'invalid_input'
  | 'invalid_current_status'
  | 'draft_not_changeable'
  | 'illegal_transition'
  | 'decline_reason_required'
  | `recovery_prerequisite:${RecoveryPrerequisite}`
  | `transition_rejected:${Exclude<ClaimTransitionRejectionReason, 'invalid_status' | 'illegal_transition'>}`
  | 'conflict'
  | 'transaction_failed';

export type ChangeClaimStatusResult =
  | {
      ok: true;
      claimId: string;
      fromStatus: ClaimStatus;
      toStatus: ClaimStatus;
      changed: boolean;
      deliveryIds: string[];
    }
  | { ok: false; code: ChangeClaimStatusCode };
