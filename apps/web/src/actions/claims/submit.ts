import { logAuditEvent } from '@/lib/audit';
import { notifyClaimSubmitted } from '@/lib/notifications';
import { hasActiveMembership } from '@/lib/subscription';
import { createClaimSchema, type CreateClaimValues } from '@/lib/validators/claims';
import { claimDocuments, claims, db } from '@interdomestik/database';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import type { Session } from './context';
import { buildClaimDocumentRows } from './documents';

export async function submitClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  data: CreateClaimValues;
}) {
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

    await logAuditEvent({
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
  } catch (error) {
    console.error('Failed to create claim:', error);
    throw new Error('Failed to create claim. Please try again.');
  }

  notifyClaimSubmitted(session.user.id, session.user.email || '', {
    id: claimId,
    title,
    category,
  }).catch((err: Error) => console.error('Failed to send claim submitted notification:', err));

  revalidatePath('/member/claims');
  return { success: true };
}
