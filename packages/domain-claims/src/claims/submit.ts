import { claimDocuments, claims, db, tenantSettings } from '@interdomestik/database';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { createClaimSchema, type CreateClaimValues } from '../validators/claims';
import { queueClaimDocumentAiWorkflows, type QueuedClaimAiRun } from './ai-workflows';
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

type ClaimAssignmentContext = {
  subscription: Awaited<ReturnType<typeof getActiveSubscription>>;
  branchId: string | null;
  agentId: string | null;
};

function resolveDefaultBranchId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value as { branchId?: string } | string;
  if (typeof normalizedValue === 'string') {
    return normalizedValue;
  }

  return normalizedValue.branchId ?? null;
}

async function loadClaimAssignmentContext(
  userId: string,
  tenantId: string
): Promise<ClaimAssignmentContext> {
  const subscription = await getActiveSubscription(userId, tenantId);
  const defaultBranchSetting = await db.query.tenantSettings.findFirst({
    where: and(
      eq(tenantSettings.tenantId, tenantId),
      eq(tenantSettings.category, 'rbac'),
      eq(tenantSettings.key, 'default_branch_id')
    ),
  });

  return {
    subscription,
    branchId: subscription?.branchId ?? resolveDefaultBranchId(defaultBranchSetting?.value),
    agentId: subscription?.agentId ?? null,
  };
}

async function persistSubmittedClaim(args: {
  claimId: string;
  tenantId: string;
  userId: string;
  branchId: string | null;
  agentId: string | null;
  data: CreateClaimValues;
}): Promise<QueuedClaimAiRun[]> {
  const { title, description, category, companyName, claimAmount, currency, incidentDate, files } =
    args.data;
  let queuedRuns: QueuedClaimAiRun[] = [];

  await db.transaction(async tx => {
    await tx.insert(claims).values({
      id: args.claimId,
      tenantId: args.tenantId,
      userId: args.userId,
      branchId: args.branchId,
      agentId: args.agentId,
      title,
      description: description || undefined,
      category,
      companyName,
      claimAmount: claimAmount || undefined,
      currency: currency || 'EUR',
      status: 'submitted',
    });

    if (!files?.length) {
      return;
    }

    const documentRows = buildClaimDocumentRows({
      claimId: args.claimId,
      uploadedBy: args.userId,
      files,
      tenantId: args.tenantId,
    });

    await tx.insert(claimDocuments).values(documentRows);

    queuedRuns = await queueClaimDocumentAiWorkflows({
      tx,
      claimId: args.claimId,
      tenantId: args.tenantId,
      userId: args.userId,
      files: documentRows.map(documentRow => ({
        documentId: documentRow.id,
        name: documentRow.name,
        path: documentRow.filePath,
        type: documentRow.fileType,
        size: documentRow.fileSize,
        bucket: documentRow.bucket,
        category: documentRow.category,
      })),
      claimSnapshot: {
        title,
        description,
        category,
        companyName,
        claimAmount,
        currency,
        incidentDate,
      },
    });
  });

  return queuedRuns;
}

async function logClaimSubmittedAudit(args: {
  deps: ClaimsDeps;
  session: ClaimsSession;
  tenantId: string;
  requestHeaders: Headers;
  claimId: string;
  data: CreateClaimValues;
}) {
  if (!args.deps.logAuditEvent) {
    return;
  }

  await args.deps.logAuditEvent({
    actorId: args.session.user.id,
    actorRole: args.session.user.role,
    tenantId: args.tenantId,
    action: 'claim.submitted',
    entityType: 'claim',
    entityId: args.claimId,
    metadata: {
      status: 'submitted',
      category: args.data.category,
      companyName: args.data.companyName,
      claimAmount: args.data.claimAmount || null,
      documents: args.data.files?.length || 0,
    },
    headers: args.requestHeaders,
  });
}

async function dispatchQueuedClaimAiRuns(
  queuedRuns: QueuedClaimAiRun[],
  deps: ClaimsDeps
): Promise<void> {
  if (!deps.dispatchClaimAiRun) {
    return;
  }

  for (const queuedRun of queuedRuns) {
    try {
      await deps.dispatchClaimAiRun(queuedRun);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to dispatch claim AI run.';
      if (deps.markClaimAiRunDispatchFailed) {
        await deps.markClaimAiRunDispatchFailed({
          runId: queuedRun.runId,
          message,
        });
      }
    }
  }
}

function notifyClaimSubmitted(args: {
  deps: ClaimsDeps;
  session: ClaimsSession;
  claimId: string;
  data: CreateClaimValues;
}) {
  if (!args.deps.notifyClaimSubmitted) {
    return;
  }

  Promise.resolve(
    args.deps.notifyClaimSubmitted(args.session.user.id, args.session.user.email || '', {
      id: args.claimId,
      title: args.data.title,
      category: args.data.category,
    })
  ).catch((err: Error) => console.error('Failed to send claim submitted notification:', err));
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
  const assignment = await loadClaimAssignmentContext(session.user.id, tenantId);

  if (!assignment.subscription) {
    throw new ClaimValidationError('Membership required to file a claim.', 'MEMBERSHIP_REQUIRED');
  }

  const result = createClaimSchema.safeParse(data);

  if (!result.success) {
    throw new ClaimValidationError('Validation failed', 'INVALID_PAYLOAD');
  }

  const { title, description, category, companyName, claimAmount, currency, incidentDate, files } =
    result.data;

  // Security: Validate ALL files before creating ANY database records
  validateClaimFiles(files, session, tenantId);

  const claimId = nanoid();
  let queuedRuns: QueuedClaimAiRun[];

  try {
    queuedRuns = await persistSubmittedClaim({
      claimId,
      tenantId,
      userId: session.user.id,
      branchId: assignment.branchId,
      agentId: assignment.agentId,
      data: result.data,
    });

    await logClaimSubmittedAudit({
      deps,
      session,
      tenantId,
      requestHeaders,
      claimId,
      data: result.data,
    });
  } catch (error) {
    console.error('Failed to create claim:', error);
    throw new Error('Failed to create claim. Please try again.');
  }

  await dispatchQueuedClaimAiRuns(queuedRuns, deps);

  notifyClaimSubmitted({ deps, session, claimId, data: result.data });

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
