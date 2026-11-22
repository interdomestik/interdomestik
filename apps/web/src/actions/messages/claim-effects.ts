import {
  answerClaimResponseRequests,
  createClaimResponseRequest,
} from '@interdomestik/domain-claims/claims/response-requests';
import { buildStaffClaimReadScope } from '@interdomestik/domain-claims/staff-claims/scope';
import type { ClaimMessageEffects } from '@interdomestik/domain-communications/messages/send';

export const claimMessageEffects: ClaimMessageEffects = {
  buildStaffClaimScope: buildStaffClaimReadScope,
  createClaimResponseRequest,
  answerClaimResponseRequests,
};
