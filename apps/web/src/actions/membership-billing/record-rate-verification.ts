'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  recordRateVerification as verifyRate,
  recordRateVerificationInputSchema,
} from '@interdomestik/domain-membership-billing/payment-port';
import { ROLES } from '@interdomestik/shared-auth';

export const recordRateVerification = defineAction({
  name: 'membershipBilling.recordRateVerification',
  basis: { kind: 'role', roles: [ROLES.tenant_admin, ROLES.admin] },
  input: recordRateVerificationInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await verifyRate(authority, input, session.user);
    if (result.ok) return result.verification;
    if (result.code === 'forbidden') return actionFailure('FORBIDDEN');
    if (result.code === 'not_found') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});
