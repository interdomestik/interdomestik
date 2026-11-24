import { and, claimDocuments, claims, eq } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import { createClaimSchema, type CreateClaimValues } from '../validators/claims';
import { ClaimValidationError } from './claim-validation-error';
import { buildClaimDocumentRows } from './documents';
import {
  assertDistinctEvidenceObjects,
  lockEvidenceObjects,
  planDraftAttachments,
  readAttachedObjects,
  type DraftClaimFile,
} from './draft-attachments';
import { resolveClaimIncidentCountryUpdate } from './incident-country';
import { validateClaimFiles } from './submit-evidence-validation';
import type { ClaimsDeps, ClaimsSession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type UpdateDraftClaimCode = ClaimValidationError['code'] | 'CONFLICT';

export type UpdateDraftClaimResult =
  | { success: true; error?: undefined; code?: undefined }
  | { success: false; error: string; code?: UpdateDraftClaimCode };

const DRAFT_CONFLICT: UpdateDraftClaimResult = {
  success: false,
  error: 'Claim changed. Refresh and retry.',
  code: 'CONFLICT',
};

function refusal(error: ClaimValidationError): UpdateDraftClaimResult {
  return { success: false, error: error.message, code: error.code };
}

/**
 * Verifies every file before anything is written, whether or not it is already attached: the
 * answer to an unverified file never depends on what any claim holds, and a re-sent file needs
 * a valid intent like a new one. Whether a verified file is this draft's, another case's or new
 * is decided only inside the write transaction.
 */
async function verifyDraftFiles(params: {
  deps: ClaimsDeps;
  files: DraftClaimFile[];
  session: ClaimsSession;
  tenantId: string;
}): Promise<void> {
  const { deps, files, session, tenantId } = params;
  assertDistinctEvidenceObjects(files);
  await validateClaimFiles(files, session, tenantId, deps);
}

export async function updateDraftClaimCore(
  params: {
    authority: TenantAuthority | null;
    session: ClaimsSession | null;
    requestHeaders: Headers;
    claimId: string;
    data: CreateClaimValues;
  },
  deps: ClaimsDeps = {}
): Promise<UpdateDraftClaimResult> {
  const { authority, session, requestHeaders, claimId, data } = params;

  if (!session || !authority) {
    return { success: false, error: 'Unauthorized' };
  }

  ensureTenantId(session);
  const { tenantId } = readTenantAuthority(authority);
  const claim = await withTenantAuthority(authority, tx =>
    tx.query.claims.findFirst({
      where: (claimsTable, { eq }) =>
        withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
    })
  );

  if (!claim) {
    return { success: false, error: 'Claim not found' };
  }

  if (claim.userId !== session.user.id) {
    return { success: false, error: 'Access denied' };
  }

  if (claimStatusFromLifecycleFields(claim) !== 'draft') {
    return { success: false, error: 'Only draft claims can be edited' };
  }

  const result = createClaimSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: 'Validation failed' };
  }

  const { title, description, category, companyName, claimAmount, currency } = result.data;
  const files = result.data.files ?? [];
  const incidentCountry = resolveClaimIncidentCountryUpdate(result.data);

  try {
    await verifyDraftFiles({ deps, files, session, tenantId });
  } catch (error) {
    if (error instanceof ClaimValidationError) return refusal(error);
    console.error('Failed to verify draft claim files:', error);
    return { success: false, error: 'Failed to update claim' };
  }

  let insertedDocuments = 0;
  try {
    // One tenant transaction: the claim update repeats the draft state and owner it was read with,
    // so a claim that changed meanwhile updates zero rows and nothing is written.
    const outcome = await withTenantAuthority(authority, async tx => {
      const updated = await tx
        .update(claims)
        .set({
          title,
          description: description || undefined,
          category,
          companyName,
          claimAmount: claimAmount || undefined,
          currency: currency || 'EUR',
          ...incidentCountry,
          updatedAt: new Date(),
        })
        .where(
          withTenant(
            tenantId,
            claims.tenantId,
            and(
              eq(claims.id, claimId),
              eq(claims.userId, session.user.id),
              eq(claims.caseLifecycleState, 'draft'),
              eq(claims.recoveryLifecycleState, 'not_started')
            )
          )
        )
        .returning({ id: claims.id });

      if (updated.length === 0) return 'conflict' as const;

      // The claim row lock now serializes updates of this draft and the object locks serialize
      // every writer of these objects (and refuse a transaction that is not READ COMMITTED). The
      // re-read locks the rows it finds FOR SHARE until commit, so a row this decision rests on
      // can be neither deleted nor moved before it commits.
      if (files.length > 0) await lockEvidenceObjects(tx, { tenantId, files });
      const attachedNow = await readAttachedObjects(tx, { tenantId, files, lockRows: true });
      // Every file is verified: one attached to another case is refused, one already this
      // draft's is not inserted again.
      const { newFiles } = planDraftAttachments({ attached: attachedNow, claimId, files });

      if (newFiles.length > 0) {
        const documentRows = buildClaimDocumentRows({
          claimId,
          uploadedBy: session.user.id,
          files: newFiles,
          tenantId,
        });
        // db-access-guard: tenant-scoped -- reason: tenantId from validated session before draft document insert
        await tx.insert(claimDocuments).values(documentRows);
      }
      return newFiles.length;
    });

    if (outcome === 'conflict') return DRAFT_CONFLICT;
    insertedDocuments = outcome;

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        authority,
        action: 'claim.updated',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          status: 'draft',
          category,
          companyName,
          claimAmount: claimAmount || null,
          documents: insertedDocuments,
          documentsAlreadyAttached: files.length - insertedDocuments,
        },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    if (error instanceof ClaimValidationError) return refusal(error);
    console.error('Failed to update claim:', error);
    return { success: false, error: 'Failed to update claim' };
  }

  if (deps.revalidatePath) {
    await deps.revalidatePath('/member/claims');
    await deps.revalidatePath(`/member/claims/${claimId}`);
  }

  return { success: true };
}
