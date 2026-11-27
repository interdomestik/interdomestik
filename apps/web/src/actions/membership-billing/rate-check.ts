'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  beginRateCheck as beginCheck,
  beginRateCheckInputSchema,
  recordRateCheckInconclusive as closeCheck,
  recordRateCheckInconclusiveInputSchema,
} from '@interdomestik/domain-membership-billing/payment-port';
import { ROLES } from '@interdomestik/shared-auth';

export const beginRateCheck = defineAction({
  name: 'membershipBilling.beginRateCheck',
  basis: { kind: 'role', roles: [ROLES.tenant_admin, ROLES.admin] },
  input: beginRateCheckInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await beginCheck(authority, input, session.user);
    if (result.ok) return result.check;
    if (result.code === 'forbidden') return actionFailure('FORBIDDEN');
    if (result.code === 'not_found') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});

export const recordRateCheckInconclusive = defineAction({
  name: 'membershipBilling.recordRateCheckInconclusive',
  basis: { kind: 'role', roles: [ROLES.tenant_admin, ROLES.admin] },
  input: recordRateCheckInconclusiveInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await closeCheck(authority, input, session.user);
    if (result.ok) return result.outcome;
    if (result.code === 'forbidden') return actionFailure('FORBIDDEN');
    if (result.code === 'not_found') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});
