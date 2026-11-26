import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { claimDocuments, claimInboundUploadDecisions } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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

  const d = claimDocuments;
  const a = claimInboundUploadDecisions;
  return withTenantAuthority(access.authority, async tx => {
    if (!(await lockCaseForRegister(tx, tenantId, claimId, actor))) return registerForbidden;
    const rows = await tx
      .select({ id: d.id, name: d.name })
      .from(d)
      .innerJoin(
        a,
        and(
          eq(d.id, a.documentId),
          eq(d.tenantId, a.tenantId),
          eq(d.claimId, a.claimId),
          eq(d.bucket, a.bucket),
          eq(d.filePath, a.filePath)
        )
      )
      .where(
        and(
          eq(d.tenantId, tenantId),
          eq(d.claimId, claimId),
          after === undefined ? undefined : gt(d.id, after),
          sql`public.claim_document_provenance_ok(${d.tenantId}, ${d.claimId}, ${d.id})`
        )
      )
      .orderBy(asc(d.id))
      .limit(PAGE_SIZE + 1);
    const documents = rows.slice(0, PAGE_SIZE);
    return {
      ok: true,
      documents,
      nextCursor: rows.length > PAGE_SIZE ? documents.at(-1)?.id : undefined,
    } as const;
  });
}
