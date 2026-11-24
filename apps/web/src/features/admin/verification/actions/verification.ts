'use server';

import { memberGuarded, runAdmittedAction } from '@/lib/privacy/require-member-acceptance';
import { runAuthenticatedAction } from '@/lib/safe-action';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
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
    return await verifyCashAttemptCore(ctx, data);
  });
}

const guardedResubmitCashAttemptAction = memberGuarded(async (authorized, input: unknown) => {
  return runAdmittedAction(authorized, async () => {
    const { tenantId } = readTenantAuthority(authorized.authority);
    const data = resubmitCashSchema.parse(input);
    await resubmitCashAttemptCore({ ...authorized, tenantId }, data);
  });
});

export async function resendActivationInviteAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = resendActivationInviteSchema.parse(input);
    return await resendActivationInviteCore(ctx, data);
  });
}

export async function resubmitCashAttemptAction(
  ...args: Parameters<typeof guardedResubmitCashAttemptAction>
) {
  return guardedResubmitCashAttemptAction(...args);
}
