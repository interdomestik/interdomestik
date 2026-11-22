'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  recordInboundCorrespondence as recordInbound,
  recordInboundCorrespondenceInputSchema,
  recordOutboundCorrespondence as recordOutbound,
  recordOutboundCorrespondenceInputSchema,
  setCorrespondenceFollowUp as setFollowUp,
  setCorrespondenceFollowUpInputSchema,
} from '@interdomestik/domain-claims/claims/correspondence';
import { ROLES } from '@interdomestik/shared-auth';
import { unstable_rethrow } from 'next/navigation';

async function recordEntry(record: ReturnType<typeof recordInbound | typeof recordOutbound>) {
  try {
    return await record;
  } catch (error) {
    unstable_rethrow(error);
    // Database exceptions can contain insert parameters, including a party contact name.
    throw new Error('Unexpected correspondence insert failure');
  }
}

export const recordOutboundCorrespondence = defineAction({
  name: 'staffClaims.recordOutboundCorrespondence',
  basis: { kind: 'role', roles: [ROLES.staff, ROLES.admin, ROLES.tenant_admin] },
  subject: { type: 'claim', from: 'claimId' },
  input: recordOutboundCorrespondenceInputSchema,
  async handler(input, { authority, session }) {
    const result = await recordEntry(recordOutbound(session, authority, input));
    if (result.ok) return { correspondenceId: result.correspondenceId };
    if (result.code === 'forbidden') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});

export const recordInboundCorrespondence = defineAction({
  name: 'staffClaims.recordInboundCorrespondence',
  basis: { kind: 'role', roles: [ROLES.staff, ROLES.admin, ROLES.tenant_admin] },
  subject: { type: 'claim', from: 'claimId' },
  input: recordInboundCorrespondenceInputSchema,
  async handler(input, { authority, session }) {
    const result = await recordEntry(recordInbound(session, authority, input));
    if (result.ok) return { correspondenceId: result.correspondenceId };
    if (result.code === 'forbidden') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});

export const setCorrespondenceFollowUp = defineAction({
  name: 'staffClaims.setCorrespondenceFollowUp',
  basis: { kind: 'role', roles: [ROLES.staff, ROLES.admin, ROLES.tenant_admin] },
  subject: { type: 'claim', from: 'claimId' },
  input: setCorrespondenceFollowUpInputSchema,
  async handler(input, { authority, session }) {
    const result = await setFollowUp(session, authority, input);
    if (result.ok) return { correspondenceId: result.correspondenceId };
    if (result.code === 'forbidden') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});
