'use server';

import { leadSalesClosedFailure } from '@/actions/leads/sales-closed';
import { runAuthenticatedAction } from '@/lib/safe-action';
import { isActionFailure } from '@/lib/safe-action.failure';
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

export async function resubmitCashAttemptAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = resubmitCashSchema.parse(input);
    return resubmitCashAttemptCore(ctx, data).catch(leadSalesClosedFailure);
  });
}

export async function resendActivationInviteAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = resendActivationInviteSchema.parse(input);
    return await resendActivationInviteCore(ctx, data);
  });
}
