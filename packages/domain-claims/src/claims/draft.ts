import { claimDocuments, claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import { createClaimSchema, type CreateClaimValues } from '../validators/claims';
import { buildClaimDocumentRows } from './documents';
import type { ClaimsDeps, ClaimsSession } from './types';

export async function updateDraftClaimCore(
  params: {
    session: ClaimsSession | null;
    requestHeaders: Headers;
    claimId: string;
    data: CreateClaimValues;
  },
  deps: ClaimsDeps = {}
) {
  const { session, requestHeaders, claimId, data } = params;

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);
  const claim = await db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found' };
  }

  if (claim.userId !== session.user.id) {
    return { success: false, error: 'Access denied' };
  }

  if (claim.status !== 'draft') {
    return { success: false, error: 'Only draft claims can be edited' };
  }

  const result = createClaimSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: 'Validation failed' };
  }

  const { title, description, category, companyName, claimAmount, currency, files } = result.data;

  try {
    await db
      .update(claims)
      .set({
        title,
        description: description || undefined,
        category,
        companyName,
        claimAmount: claimAmount || undefined,
        currency: currency || 'EUR',
        updatedAt: new Date(),
      })
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

    if (files?.length) {
      const documentRows = buildClaimDocumentRows({
        claimId,
        uploadedBy: session.user.id,
        files,
        tenantId,
      });

      await db.insert(claimDocuments).values(documentRows);
    }

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
        action: 'claim.updated',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          status: 'draft',
          category,
          companyName,
          claimAmount: claimAmount || null,
          documents: files?.length || 0,
        },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    console.error('Failed to update claim:', error);
    return { success: false, error: 'Failed to update claim' };
  }

  if (deps.revalidatePath) {
    await deps.revalidatePath('/member/claims');
    await deps.revalidatePath(`/member/claims/${claimId}`);
  }

  return { success: true };
}

export async function cancelClaimCore(
  params: {
    session: ClaimsSession | null;
    requestHeaders: Headers;
    claimId: string;
  },
  deps: ClaimsDeps = {}
) {
  const { session, requestHeaders, claimId } = params;

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);
  const claim = await db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found' };
  }

  if (claim.userId !== session.user.id) {
    return { success: false, error: 'Access denied' };
  }

  if (claim.status === 'resolved' || claim.status === 'rejected') {
    return { success: false, error: 'Claim cannot be cancelled' };
  }

  try {
    await db
      .update(claims)
      .set({
        status: 'rejected',
        updatedAt: new Date(),
      })
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
        action: 'claim.cancelled',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          oldStatus: claim.status,
          newStatus: 'rejected',
        },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    console.error('Failed to cancel claim:', error);
    return { success: false, error: 'Failed to cancel claim' };
  }

  if (deps.revalidatePath) {
    await deps.revalidatePath('/member/claims');
    await deps.revalidatePath(`/member/claims/${claimId}`);
  }

  return { success: true };
}
