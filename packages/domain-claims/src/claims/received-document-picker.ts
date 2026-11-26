import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { claimDocuments, claimInboundUploadDecisions } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withPrincipalTenantContext } from '@interdomestik/database/free-start-drafts';

import {
  lockCaseForRegister,
  registerClaimInput,
  registerForbidden,
  registerId,
  resolveRegisterRead,
} from './case-register-access';
import type { ClaimsSession } from './types';

const PAGE_SIZE = 20;
export const receivedPickerInput = registerClaimInput.extend({
  after: registerId.max(128).optional(),
});

export async function listReceivedDocumentOptions(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterRead(session, authority, input, 'full', receivedPickerInput);
  if (!access.ok) return access;
  const {
    actor,
    tenantId,
    data: { claimId, after },
  } = access;
  if (actor.role !== 'staff') return registerForbidden;

  return withPrincipalTenantContext(access.authority, async tx => {
    if (!(await lockCaseForRegister(tx, tenantId, claimId, actor))) return registerForbidden;
    const rows = await tx
      .select({ id: claimDocuments.id, name: claimDocuments.name })
      .from(claimDocuments)
      .innerJoin(
        claimInboundUploadDecisions,
        and(
          eq(claimDocuments.id, claimInboundUploadDecisions.documentId),
          eq(claimDocuments.tenantId, claimInboundUploadDecisions.tenantId),
          eq(claimDocuments.claimId, claimInboundUploadDecisions.claimId),
          eq(claimDocuments.bucket, claimInboundUploadDecisions.bucket),
          eq(claimDocuments.filePath, claimInboundUploadDecisions.filePath)
        )
      )
      .where(
        and(
          eq(claimDocuments.tenantId, tenantId),
          eq(claimDocuments.claimId, claimId),
          after === undefined ? undefined : gt(claimDocuments.id, after),
          sql`public.claim_document_provenance_ok(${claimDocuments.tenantId}, ${claimDocuments.claimId}, ${claimDocuments.id})`
        )
      )
      .orderBy(asc(claimDocuments.id))
      .limit(PAGE_SIZE + 1);
    const documents = rows.slice(0, PAGE_SIZE);
    return {
      ok: true,
      documents,
      nextCursor: rows.length > PAGE_SIZE ? documents.at(-1)?.id : undefined,
    } as const;
  });
}
