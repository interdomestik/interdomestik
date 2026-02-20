import { claimDocuments, claims, db, tenantSettings } from '@interdomestik/database';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
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

  // Task A: Fix Claims Attribution
  // 1. Fetch active subscription to get user's assigned branch/agent
  const subscription = await getActiveSubscription(session.user.id, tenantId);

  // 2. Fetch tenant default branch as fallback
  // Logic: query tenant_settings for category='rbac', key='default_branch_id'
  const defaultBranchSetting = await db.query.tenantSettings.findFirst({
    where: and(
      eq(tenantSettings.tenantId, tenantId),
      eq(tenantSettings.category, 'rbac'),
      eq(tenantSettings.key, 'default_branch_id')
    ),
  });

  // 3. Determine final branchId/agentId
  // Priority: Subscription > Default > null (should not happen if configured correctly)
  let branchId = subscription?.branchId ?? null;
  const agentId = subscription?.agentId ?? null;

  if (!branchId && defaultBranchSetting?.value) {
    // strict cast as we know the shape of value provided it's set correctly
    const val = defaultBranchSetting.value as { branchId?: string } | string;
    if (typeof val === 'string') {
      branchId = val;
    } else if (typeof val === 'object' && val.branchId) {
      branchId = val.branchId;
    }
  }

  // 4. Enforce Access: User must have an active subscription OR be in a grace period allowed by getActiveSubscription
  if (!subscription) {
    throw new ClaimValidationError('Membership required to file a claim.', 'MEMBERSHIP_REQUIRED');
  }

  const result = createClaimSchema.safeParse(data);

  if (!result.success) {
    throw new ClaimValidationError('Validation failed', 'INVALID_PAYLOAD');
  }

  const { title, description, category, companyName, claimAmount, currency, files } = result.data;

  // Security: Validate ALL files before creating ANY database records
  validateClaimFiles(files, session, tenantId);

  const claimId = nanoid();

  try {
    await db.transaction(async tx => {
      await tx.insert(claims).values({
        id: claimId,
        tenantId,
        userId: session.user.id,
        branchId, // Added: derived from sub or default
        agentId, // Added: derived from sub
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
        tenantId,
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

  return { success: true, claimId };
}

function validateClaimFiles(
  files: CreateClaimValues['files'],
  session: ClaimsSession,
  tenantId: string
) {
  if (!files?.length) return;

  const expectedPrefix = `pii/tenants/${tenantId}/claims/${session.user.id}/`;
  const expectedBucket = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - aligned with upload API
  const ALLOWED_TYPES = new Set([
    'application/pdf',
    'text/plain',
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
    if (file.bucket !== expectedBucket) {
      throw new ClaimValidationError(
        'Invalid file bucket. Evidence must be stored in the designated claim evidence bucket.',
        'INVALID_BUCKET'
      );
    }
    if (!file.path.startsWith(expectedPrefix)) {
      throw new ClaimValidationError(
        'Invalid file path detected. Evidence must be uploaded by the claimant.',
        'INVALID_PATH'
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new ClaimValidationError(
        `File too large: ${file.name}. Max size is 10MB.`,
        'INVALID_SIZE'
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new ClaimValidationError(
        `Unsupported file type: ${file.type}. Allowed: PDF, TXT, Images, Audio.`,
        'INVALID_TYPE'
      );
    }
  }
}
