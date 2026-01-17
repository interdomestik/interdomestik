'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import {
  getVerificationRequests,
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
    return await getVerificationRequests(ctx, params);
  });
}

export async function verifyCashAttemptAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = verifyCashSchema.parse(input);
    return await verifyCashAttemptCore(ctx, data);
  });
}

export async function resubmitCashAttemptAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = resubmitCashSchema.parse(input);
    return await resubmitCashAttemptCore(ctx, data);
  });
}
