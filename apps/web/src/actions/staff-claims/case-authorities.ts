'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  recordCaseAuthority as recordAuthority,
  recordCaseAuthorityInputSchema,
  revokeCaseAuthority as revokeAuthority,
  revokeCaseAuthorityInputSchema,
} from '@interdomestik/domain-claims/claims/case-authorities';
import {
  updateGreenCardCaseFields as updateCaseFields,
  updateGreenCardCaseFieldsInputSchema,
} from '@interdomestik/domain-claims/claims/green-card-case-fields';
import { ROLES } from '@interdomestik/shared-auth';

export const recordCaseAuthority = defineAction({
  name: 'staffClaims.recordCaseAuthority',
  basis: { kind: 'role', roles: [ROLES.staff, ROLES.admin, ROLES.tenant_admin] },
  subject: { type: 'claim', from: 'claimId' },
  input: recordCaseAuthorityInputSchema,
  async handler(input, { authority, session }) {
    const result = await recordAuthority(session, authority, input);
    if (result.ok) return { authorityId: result.authorityId };
    if (result.code === 'forbidden') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});

export const revokeCaseAuthority = defineAction({
  name: 'staffClaims.revokeCaseAuthority',
  basis: { kind: 'role', roles: [ROLES.staff, ROLES.admin, ROLES.tenant_admin] },
  subject: { type: 'claim', from: 'claimId' },
  input: revokeCaseAuthorityInputSchema,
  async handler(input, { authority, session }) {
    const result = await revokeAuthority(session, authority, input);
    if (result.ok) return { authorityId: result.authorityId };
    if (result.code === 'forbidden') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});

export const updateGreenCardCaseFields = defineAction({
  name: 'staffClaims.updateGreenCardCaseFields',
  basis: { kind: 'role', roles: [ROLES.staff, ROLES.admin, ROLES.tenant_admin] },
  subject: { type: 'claim', from: 'claimId' },
  input: updateGreenCardCaseFieldsInputSchema,
  async handler(input, { authority, session }) {
    const result = await updateCaseFields(session, authority, input);
    if (result.ok) return result.fields;
    if (result.code === 'forbidden') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});
