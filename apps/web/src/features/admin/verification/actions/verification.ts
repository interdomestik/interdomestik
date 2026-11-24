'use server';

import { leadSalesClosedFailure } from '@/actions/leads/sales-closed';
import { defineAction, runAuthenticatedAction } from '@/lib/safe-action';
import { isActionFailure } from '@/lib/safe-action.failure';
import { ROLES } from '@interdomestik/shared-auth';
import { redactVerificationRequestsForRole } from '../server/branch-manager-redaction';
import { withSessionStaffBranch } from '../server/queries/read-access';
import {
  getVerificationRequests,
  resendActivationInviteCore,
  resendActivationInviteSchema,
  resubmitCashAttemptCore,
  resubmitCashSchema,
  verifyCashAttemptCore,
  verifyCashSchema,
  type VerificationView,
} from '../server/verification.core';

export async function getVerificationRequestsAction(params: {
  view: VerificationView;
  query?: string;
}) {
  return runAuthenticatedAction(async ctx => {
    const requests = await getVerificationRequests(withSessionStaffBranch(ctx), params);
    return redactVerificationRequestsForRole(requests, ctx.userRole);
  });
}

export async function verifyCashAttemptAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = verifyCashSchema.parse(input);
    return verifyCashAttemptCore(ctx, data).catch(error => {
      if (isActionFailure(error)) {
        return error;
      }
      return leadSalesClosedFailure(error);
    });
  });
}

export const resubmitCashAttemptAction = defineAction({
  name: 'verification.resubmitCashAttempt',
  basis: { kind: 'role', roles: [ROLES.agent] },
  input: resubmitCashSchema,
  subject: { type: 'none' },
  async handler(input, ctx) {
    try {
      await resubmitCashAttemptCore(ctx, input);
    } catch (error) {
      if (isActionFailure(error)) {
        return error;
      }
      return leadSalesClosedFailure(error);
    }
  },
});

export async function resendActivationInviteAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = resendActivationInviteSchema.parse(input);
    return await resendActivationInviteCore(ctx, data);
  });
}
