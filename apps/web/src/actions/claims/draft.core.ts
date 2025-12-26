import { logAuditEvent } from '@/lib/audit';
import { createClaimSchema, type CreateClaimValues } from '@/lib/validators/claims';
import { claimDocuments, claims, db, eq } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';
import type { Session } from './context';
import { buildClaimDocumentRows } from './documents';

export async function updateDraftClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  data: CreateClaimValues;
}) {
  const { session, requestHeaders, claimId, data } = params;

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
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
      .where(eq(claims.id, claimId));

    if (files?.length) {
      const documentRows = buildClaimDocumentRows({
        claimId,
        uploadedBy: session.user.id,
        files,
      });

      await db.insert(claimDocuments).values(documentRows);
    }

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
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
  } catch (error) {
    console.error('Failed to update claim:', error);
    return { success: false, error: 'Failed to update claim' };
  }

  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${claimId}`);

  return { success: true };
}

export async function cancelClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
}) {
  const { session, requestHeaders, claimId } = params;

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
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
      .where(eq(claims.id, claimId));

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'claim.cancelled',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        oldStatus: claim.status,
        newStatus: 'rejected',
      },
      headers: requestHeaders,
    });
  } catch (error) {
    console.error('Failed to cancel claim:', error);
    return { success: false, error: 'Failed to cancel claim' };
  }

  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${claimId}`);

  return { success: true };
}
