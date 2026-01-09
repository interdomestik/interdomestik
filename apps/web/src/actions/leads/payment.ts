'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { startPayment, startPaymentSchema } from '@interdomestik/domain-leads';

export async function startPaymentAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = startPaymentSchema.parse(input);
    return await startPayment(
      {
        tenantId: ctx.session.user.tenantId,
      },
      data
    );
  });
}
