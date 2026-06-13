import { z } from 'zod';

import { RECOVERY_DECLINE_REASON_CODES, RECOVERY_DECISION_TYPES } from './types';

export const saveRecoveryDecisionSchema = z.discriminatedUnion('decisionType', [
  z.object({
    claimId: z.string().trim().min(1, 'Claim ID is required'),
    decisionType: z.literal(RECOVERY_DECISION_TYPES[0]),
    explanation: z.string().trim().optional(),
  }),
  z.object({
    claimId: z.string().trim().min(1, 'Claim ID is required'),
    decisionType: z.literal(RECOVERY_DECISION_TYPES[1]),
    declineReasonCode: z.enum(RECOVERY_DECLINE_REASON_CODES),
    explanation: z.string().trim().optional(),
  }),
]);
