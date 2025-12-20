'use server';

import { auth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { notifyClaimSubmitted, notifyStatusChanged } from '@/lib/notifications';
import { claimDocuments, claims, db, eq, user } from '@interdomestik/database';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { z } from 'zod';

const claimSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  category: z.string().min(1, 'Please select a category'),
  companyName: z.string().min(1, 'Company name is required'),
  claimAmount: z
    .string()
    .optional()
    .transform(val => (val ? val : null)), // Handle empty string for optional decimal
  currency: z.string().default('EUR'),
});

export async function createClaim(prevState: unknown, formData: FormData) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session) {
    return { error: 'Unauthorized' };
  }

  const result = claimSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    // Flatten Zod errors for easier client-side handling
    const errors = result.error.flatten().fieldErrors;
    // Map array of strings to single string (taking the first error message)
    const formattedErrors: Record<string, string> = {};

    // Explicitly iterate over known keys or cast key
    Object.keys(errors).forEach(key => {
      const fieldKey = key as keyof typeof errors;
      const messages = errors[fieldKey];
      if (messages && messages.length > 0) {
        formattedErrors[key] = messages[0];
      }
    });

    return { error: 'Validation failed', issues: formattedErrors };
  }

  const { title, description, category, companyName, claimAmount, currency } = result.data;

  const claimId = nanoid();

  try {
    await db.insert(claims).values({
      id: claimId,
      userId: session.user.id,
      title,
      description,
      category,
      companyName,
      claimAmount: claimAmount || undefined, // Drizzle handles decimal strings
      currency,
      status: 'draft',
    });

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'claim.created',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        status: 'draft',
        category,
        companyName,
        claimAmount: claimAmount || null,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    console.error('Failed to create claim:', error);
    return { error: 'Failed to create claim. Please try again.' };
  }

  // We return success and let the client handle the redirect to /dashboard/claims
  // this is often smoother for UX than server-side redirect in an action which can be abrupt.
  return { success: true };
}

// Simplified action for the wizard component with typed data
import { createClaimSchema, type CreateClaimValues } from '@/lib/validators/claims';

// Simplified action for the wizard component with typed data
export async function submitClaim(data: CreateClaimValues) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session) {
    throw new Error('Unauthorized');
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
      status: 'submitted', // Auto submit from wizard
    });

    if (files?.length) {
      const documentRows = files.map(file => ({
        id: nanoid(),
        claimId,
        name: file.name,
        filePath: file.path,
        fileType: file.type,
        fileSize: file.size,
        bucket: file.bucket,
        classification: file.classification || 'pii',
        category: 'evidence' as const,
        uploadedBy: session.user.id,
      }));

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

  // Send notification (fire and forget - don't block the response)
  notifyClaimSubmitted(session.user.id, session.user.email || '', {
    id: claimId,
    title,
    category,
  }).catch((err: Error) => console.error('Failed to send claim submitted notification:', err));

  revalidatePath('/dashboard/claims');
  return { success: true };
}

import { revalidatePath } from 'next/cache';

export async function updateDraftClaim(claimId: string, data: CreateClaimValues) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

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
      const documentRows = files.map(file => ({
        id: nanoid(),
        claimId,
        name: file.name,
        filePath: file.path,
        fileType: file.type,
        fileSize: file.size,
        bucket: file.bucket,
        classification: file.classification || 'pii',
        category: 'evidence' as const,
        uploadedBy: session.user.id,
      }));

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

  revalidatePath('/dashboard/claims');
  revalidatePath(`/dashboard/claims/${claimId}`);

  return { success: true };
}

export async function cancelClaim(claimId: string) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

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

  revalidatePath('/dashboard/claims');
  revalidatePath(`/dashboard/claims/${claimId}`);

  return { success: true };
}

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session || (session.user.role !== 'admin' && session.user.role !== 'staff')) {
    return { error: 'Unauthorized' };
  }

  // Validate status against enum
  const validStatuses = [
    'draft',
    'submitted',
    'verification',
    'evaluation',
    'negotiation',
    'court',
    'resolved',
    'rejected',
  ];
  if (!validStatuses.includes(newStatus)) {
    return { error: 'Invalid status' };
  }

  try {
    // Fetch claim and owner info for notification
    const claim = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
    });

    if (!claim) {
      return { error: 'Claim not found' };
    }

    const oldStatus = claim.status;

    // Update the status
    await db
      .update(claims)
      .set({
        // @ts-expect-error - enum type mismatch with string, guarded by runtime check
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId));

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'claim.status_changed',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        oldStatus,
        newStatus,
      },
      headers: requestHeaders,
    });

    // Send notification to claim owner (fire and forget)
    if (claim.userId && oldStatus !== newStatus) {
      const claimOwner = await db.query.user.findFirst({
        where: eq(user.id, claim.userId),
      });

      if (claimOwner?.email) {
        notifyStatusChanged(
          claim.userId,
          claimOwner.email,
          { id: claimId, title: claim.title },
          oldStatus ?? 'unknown',
          newStatus
        ).catch((err: Error) => console.error('Failed to send status change notification:', err));
      }
    }

    revalidatePath('/admin/claims');
    revalidatePath(`/admin/claims/${claimId}`);
    revalidatePath('/dashboard/claims'); // Update user view too

    return { success: true };
  } catch (e) {
    console.error('Failed to update status:', e);
    return { error: 'Failed to update status' };
  }
}
