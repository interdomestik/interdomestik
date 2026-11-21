'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  recordExchangeRate as publishRate,
  recordExchangeRateInputSchema,
} from '@interdomestik/domain-membership-billing/payment-port';
import { ROLES } from '@interdomestik/shared-auth';

export const recordExchangeRate = defineAction({
  name: 'membershipBilling.recordExchangeRate',
  basis: { kind: 'role', roles: [ROLES.tenant_admin] },
  input: recordExchangeRateInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await publishRate(authority, input, session.user);
    if (result.ok) return result.rate;
    switch (result.code) {
      case 'forbidden':
        return actionFailure('FORBIDDEN');
      case 'not_found':
        return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
      case 'invalid':
      case 'conflict':
        return actionFailure(result.code);
    }
  },
});
