'use server';

import { isClaimUploadPaused } from '@/features/claims/upload/server/claim-upload-cutover';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  recordInboundCorrespondence as recordInbound,
  recordInboundCorrespondenceInputSchema,
  recordOutboundCorrespondence as recordOutbound,
  recordOutboundCorrespondenceInputSchema,
  setCorrespondenceFollowUp as setFollowUp,
  setCorrespondenceFollowUpInputSchema,
} from '@interdomestik/domain-claims/claims/correspondence';
import {
  listReceivedDocumentOptions,
  receivedPickerInput,
} from '@interdomestik/domain-claims/claims/received-document-picker';
import { ROLES } from '@interdomestik/shared-auth';
import { withoutParameters } from './register-failure';

export const recordOutboundCorrespondence = defineAction({
  name: 'staffClaims.recordOutboundCorrespondence',
  basis: { kind: 'role', roles: [ROLES.staff, ROLES.admin, ROLES.tenant_admin] },
  subject: { type: 'claim', from: 'claimId' },
  input: recordOutboundCorrespondenceInputSchema,
  async handler(input, { authority, session }) {
    const result = await withoutParameters(
      recordOutbound(session, authority, input),
      'correspondence insert'
    );
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
    const { tenantId } = readTenantAuthority(authority);
    if (
      input.receivedDocumentIds?.length &&
      (await isClaimUploadPaused(authority, tenantId, input.claimId))
    ) {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    const result = await withoutParameters(
      recordInbound(session, authority, input),
      'correspondence insert'
    );
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
    const result = await withoutParameters(
      setFollowUp(session, authority, input),
      'correspondence follow-up'
    );
    if (result.ok) return { correspondenceId: result.correspondenceId };
    if (result.code === 'forbidden') {
      return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    }
    return actionFailure(result.code);
  },
});

export const readReceivedDocumentOptions = defineAction({
  name: 'staffClaims.readReceivedDocumentOptions',
  basis: { kind: 'role', roles: [ROLES.staff] },
  subject: { type: 'claim', from: 'claimId' },
  input: receivedPickerInput,
  async handler(input, { authority, session }) {
    const result = await withoutParameters(
      listReceivedDocumentOptions(session, authority, input),
      'received document picker'
    );
    if (!result.ok) return actionFailure('FORBIDDEN', undefined, { conceal: 'NOT_FOUND' });
    return { documents: result.documents, nextCursor: result.nextCursor };
  },
});
