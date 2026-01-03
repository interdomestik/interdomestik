import { claimDocuments, claims, db } from '@interdomestik/database';
import { hasActiveMembership } from '@interdomestik/domain-membership-billing/subscription';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';

import { createClaimSchema, type CreateClaimValues } from '../validators/claims';
import { buildClaimDocumentRows } from './documents';
import type { ClaimsDeps, ClaimsSession } from './types';

// Custom error for validation failures (can be mapped to 400/403 by API routes)
export class ClaimValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNAUTHORIZED'
      | 'MEMBERSHIP_REQUIRED'
      | 'INVALID_PAYLOAD'
      | 'INVALID_BUCKET'
      | 'INVALID_PATH'
      | 'INVALID_SIZE'
      | 'INVALID_TYPE' = 'INVALID_PATH'
  ) {
    super(message);
    this.name = 'ClaimValidationError';
  }
}

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
    throw new ClaimValidationError('Unauthorized', 'UNAUTHORIZED');
  }

  const tenantId = ensureTenantId(session);
  const hasAccess = await hasActiveMembership(session.user.id, tenantId);

  if (!hasAccess) {
    throw new ClaimValidationError('Membership required to file a claim.', 'MEMBERSHIP_REQUIRED');
  }

  const result = createClaimSchema.safeParse(data);

  if (!result.success) {
    throw new ClaimValidationError('Validation failed', 'INVALID_PAYLOAD');
  }

  const { title, description, category, companyName, claimAmount, currency, files } = result.data;

  // Security: Validate ALL files before creating ANY database records
  // This prevents orphaned claims and ensures data integrity.
  if (files?.length) {
    const expectedPrefix = `pii/tenants/${tenantId}/claims/${session.user.id}/`;
    const expectedBucket = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - aligned with upload API
    const ALLOWED_TYPES = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/jpg',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/mpeg',
      'audio/m4a',
    ]);

    for (const file of files) {
      // 1. Bucket Check
      if (file.bucket !== expectedBucket) {
        throw new ClaimValidationError(
          'Invalid file bucket. Evidence must be stored in the designated claim evidence bucket.',
          'INVALID_BUCKET'
        );
      }
      // 2. Path Ownership Check
      if (!file.path.startsWith(expectedPrefix)) {
        throw new ClaimValidationError(
          'Invalid file path detected. Evidence must be uploaded by the claimant.',
          'INVALID_PATH'
        );
      }
      // 3. Size Check (Metadata)
      if (file.size > MAX_FILE_SIZE) {
        throw new ClaimValidationError(
          `File too large: ${file.name}. Max size is 10MB.`,
          'INVALID_SIZE'
        );
      }
      // 4. Type Check (Metadata)
      if (!ALLOWED_TYPES.has(file.type)) {
        throw new ClaimValidationError(
          `Unsupported file type: ${file.type}. Allowed: PDF, Images, Audio.`,
          'INVALID_TYPE'
        );
      }
    }
  }

  const claimId = nanoid();

  try {
    await db.transaction(async tx => {
      await tx.insert(claims).values({
        id: claimId,
        tenantId,
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
          tenantId,
        });

        await tx.insert(claimDocuments).values(documentRows);
      }
    });

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
