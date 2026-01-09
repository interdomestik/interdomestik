'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { verifyCashPayment, verifyCashSchema } from '@interdomestik/domain-leads';

export async function verifyCashAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = verifyCashSchema.parse(input);
    const allowedRoles = ['admin', 'super_admin', 'branch_manager', 'tenant_admin'];
    const { userRole, session, tenantId } = ctx;

    if (!allowedRoles.includes(userRole)) {
      throw new Error('Unauthorized: Insufficient permissions to verify cash.');
    }

    return await verifyCashPayment(
      {
        tenantId,
        userId: session.user.id,
      },
      data
    );
  });
}
