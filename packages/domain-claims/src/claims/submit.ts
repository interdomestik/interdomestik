import { hasActiveMembership } from '@interdomestik/domain-membership-billing/subscription';
import { claimDocuments, claims, db } from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { createClaimSchema, type CreateClaimValues } from '../validators/claims';
import { buildClaimDocumentRows } from './documents';
import type { ClaimsDeps, ClaimsSession } from './types';

export async function submitClaimCore(
  params: {
    session: ClaimsSession | null;
    requestHeaders: Headers;
    data: CreateClaimValues;
  },
  deps: ClaimsDeps = {}
) {
  const { session, requestHeaders, data } = params;

  if (!session) {
    throw new Error('Unauthorized');
  }

  const hasAccess = await hasActiveMembership(session.user.id);

  if (!hasAccess) {
    throw new Error('Membership required to file a claim.');
  }

  const result = createClaimSchema.safeParse(data);

  if (!result.success) {
    throw new Error('Validation failed');
  }

  const { title, description, category, companyName, claimAmount, currency, files } = result.data;
  const claimId = nanoid();

  try {
    await db.insert(claims).values({
      id: claimId,
      userId: session.user.id,
      title,
      description: description || undefined,
      category,
      companyName,
      claimAmount: claimAmount || undefined,
      currency: currency || 'EUR',
      status: 'submitted',
    });

    if (files?.length) {
      const documentRows = buildClaimDocumentRows({
        claimId,
        uploadedBy: session.user.id,
        files,
      });

      await db.insert(claimDocuments).values(documentRows);
    }

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: 'claim.submitted',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          status: 'submitted',
          category,
          companyName,
          claimAmount: claimAmount || null,
          documents: files?.length || 0,
        },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    console.error('Failed to create claim:', error);
    throw new Error('Failed to create claim. Please try again.');
  }

  if (deps.notifyClaimSubmitted) {
    Promise.resolve(
      deps.notifyClaimSubmitted(session.user.id, session.user.email || '', {
        id: claimId,
        title,
        category,
      })
    ).catch((err: Error) => console.error('Failed to send claim submitted notification:', err));
  }

  if (deps.revalidatePath) {
    await deps.revalidatePath('/member/claims');
  }

  return { success: true };
}
