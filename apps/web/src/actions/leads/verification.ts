'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import {
  getPendingCashAttempts,
  verifyCashAttemptCore,
  verifyCashSchema,
} from './verification.core';

export async function getPendingCashAttemptsAction() {
  return runAuthenticatedAction(async ctx => {
    return await getPendingCashAttempts(ctx);
  });
}

export async function verifyCashAttemptAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = verifyCashSchema.parse(input);
    return await verifyCashAttemptCore(ctx, data);
  });
}
