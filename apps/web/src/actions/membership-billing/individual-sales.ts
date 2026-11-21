'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  getSaleOffer as quote,
  getSaleOfferInputSchema,
  publishPlanVersion as publish,
  publishPlanVersionInputSchema,
  recordSale as sell,
  recordSaleInputSchema,
  withdrawPlanVersion as withdraw,
  withdrawPlanVersionInputSchema,
} from '@interdomestik/domain-membership-billing/payment-port';
import { ROLES } from '@interdomestik/shared-auth';

function saleFailure(code: string) {
  if (code === 'not_found') return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
  if (code === 'forbidden') return actionFailure('FORBIDDEN');
  return actionFailure(code);
}

const administrator = { kind: 'role', roles: [ROLES.tenant_admin] } as const;
const seller = { kind: 'role', roles: [ROLES.agent, ROLES.staff, ROLES.tenant_admin] } as const;

export const publishPlanVersion = defineAction({
  name: 'membershipBilling.publishPlanVersion',
  basis: administrator,
  input: publishPlanVersionInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await publish(authority, input, session.user);
    return result.ok ? result.version : saleFailure(result.code);
  },
});

export const withdrawPlanVersion = defineAction({
  name: 'membershipBilling.withdrawPlanVersion',
  basis: administrator,
  input: withdrawPlanVersionInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await withdraw(authority, input, session.user);
    return result.ok ? result.version : saleFailure(result.code);
  },
});

export const getSaleOffer = defineAction({
  name: 'membershipBilling.getSaleOffer',
  basis: seller,
  input: getSaleOfferInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await quote(authority, input, session.user);
    return result.ok ? result.offer : saleFailure(result.code);
  },
});

export const recordSale = defineAction({
  name: 'membershipBilling.recordSale',
  basis: seller,
  input: recordSaleInputSchema,
  subject: { type: 'none' },
  async handler(input, { authority, session }) {
    const result = await sell(authority, input, session.user);
    return result.ok ? result.sale : saleFailure(result.code);
  },
});
