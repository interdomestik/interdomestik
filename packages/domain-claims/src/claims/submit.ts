import { agentClients, claimDocuments, claims, db, tenantSettings } from '@interdomestik/database';
import { generateClaimNumber } from '@interdomestik/database/claim-number';
import { withTenant } from '@interdomestik/database/tenant-security';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createClaimSchema, type CreateClaimValues } from '../validators/claims';
import type { QueuedClaimAiRun } from './ai-workflow-types';
import { buildClaimDocumentRows } from './documents';
import {
  buildClaimStartPublicNote,
  resolveSubmittedClaimIncidentCountry,
} from './incident-country';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import { recordSubmittedClaimLifecycle } from './transition-side-effects';
import type { ClaimStartHandoffContext, ClaimsDeps, ClaimsSession } from './types';

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
  agentAttributionSource: 'agent_clients' | 'subscription' | 'none';
  branchResolutionSource: 'subscription' | 'agent' | 'tenant_default' | 'none';
};

function resolveDefaultBranchId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value as
    | { branchId?: string; defaultBranchId?: string; id?: string; value?: string }
    | string;
  if (typeof normalizedValue === 'string') {
    return normalizedValue;
  }

  return (
    normalizedValue.branchId ??
    normalizedValue.defaultBranchId ??
    normalizedValue.id ??
    normalizedValue.value ??
    null
  );
}

async function resolveAgentBranchId(agentId: string, tenantId: string): Promise<string | null> {
  const agent = await db.query.user.findFirst({
    where: (user, { eq }) => withTenant(tenantId, user.tenantId, eq(user.id, agentId)),
    columns: { branchId: true },
  });

  return agent?.branchId ?? null;
}

async function loadClaimAssignmentContext(
  userId: string,
  tenantId: string
): Promise<ClaimAssignmentContext> {
  const subscription = await getActiveSubscription(userId, tenantId);
  const activeAssignment = await db.query.agentClients.findFirst({
    where: withTenant(
      tenantId,
      agentClients.tenantId,
      and(eq(agentClients.memberId, userId), eq(agentClients.status, 'active'))
    ),
    columns: { agentId: true },
  });
  const agentId = activeAssignment?.agentId ?? subscription?.agentId ?? null;
  let agentBranchId: string | null = null;
  if (!subscription?.branchId && agentId) {
    agentBranchId = await resolveAgentBranchId(agentId, tenantId);
  }
  const defaultBranchSetting = await db.query.tenantSettings.findFirst({
    where: withTenant(
      tenantId,
      tenantSettings.tenantId,
      and(eq(tenantSettings.category, 'rbac'), eq(tenantSettings.key, 'default_branch_id'))
    ),
  });
  const defaultBranchId = resolveDefaultBranchId(defaultBranchSetting?.value);
  const agentAttributionSource = activeAssignment?.agentId
    ? 'agent_clients'
    : agentId
      ? 'subscription'
      : 'none';
  const subscriptionBranchId = subscription?.branchId ?? null;
  const branchId = subscriptionBranchId ?? agentBranchId ?? defaultBranchId ?? null;
  let branchResolutionSource: ClaimAssignmentContext['branchResolutionSource'] = 'none';
  if (subscriptionBranchId) {
    branchResolutionSource = 'subscription';
  } else if (agentBranchId) {
    branchResolutionSource = 'agent';
  } else if (defaultBranchId) {
    branchResolutionSource = 'tenant_default';
  }

  return {
    subscription,
    branchId,
    agentId,
    agentAttributionSource,
    branchResolutionSource,
  };
}

async function persistSubmittedClaim(args: {
  claimId: string;
  tenantId: string;
  userId: string;
  createdAt: Date;
  changedByRole: string;
  hostId?: string | null;
  branchId: string | null;
  agentId: string | null;
  handoffContext?: ClaimStartHandoffContext | null;
  data: CreateClaimValues;
}): Promise<{ claimNumber: string; queuedRuns: QueuedClaimAiRun[] }> {
  const { title, description, category, companyName, claimAmount, currency, files } = args.data;
  const publicNote = buildClaimStartPublicNote(args.handoffContext);
  const incidentCountry = resolveSubmittedClaimIncidentCountry({
    data: args.data,
    handoffContext: args.handoffContext,
  });
  let claimNumber = '';

  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
  await db.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
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
      ...mapClaimStatusToLifecycleStates('submitted'),
      ...incidentCountry,
      claimNumber: null,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    });

    claimNumber = await generateClaimNumber(tx, {
      tenantId: args.tenantId,
      claimId: args.claimId,
      createdAt: args.createdAt,
    });

    await recordSubmittedClaimLifecycle(tx, {
      changedByRole: args.changedByRole,
      claimId: args.claimId,
      createdAt: args.createdAt,
      data: args.data,
      hostId: args.hostId,
      publicNote,
      tenantId: args.tenantId,
      userId: args.userId,
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

    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx.insert(claimDocuments).values(documentRows);
  });

  return {
    claimNumber,
    queuedRuns: [],
  };
}

async function logClaimSubmittedAudit(args: {
  deps: ClaimsDeps;
  session: ClaimsSession;
  tenantId: string;
  requestHeaders: Headers;
  claimId: string;
  data: CreateClaimValues;
  assignment: Pick<
    ClaimAssignmentContext,
    'agentAttributionSource' | 'agentId' | 'branchId' | 'branchResolutionSource'
  >;
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
      agentId: args.assignment.agentId,
      agentAttributionSource: args.assignment.agentAttributionSource,
      branchId: args.assignment.branchId,
      branchResolutionSource: args.assignment.branchResolutionSource,
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
    hostId?: string | null;
    data: CreateClaimValues;
    handoffContext?: ClaimStartHandoffContext | null;
  },
  deps: ClaimsDeps = {}
) {
  const { session, requestHeaders, data, handoffContext } = params;

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

  // Security: Validate ALL files before creating ANY database records
  await validateClaimFiles(result.data.files, session, tenantId, deps);

  const claimId = nanoid();
  const createdAt = new Date();
  let queuedRuns: QueuedClaimAiRun[];
  let claimNumber = '';

  try {
    const persistedClaim = await persistSubmittedClaim({
      claimId,
      tenantId,
      userId: session.user.id,
      createdAt,
      changedByRole: session.user.role ?? 'member',
      branchId: assignment.branchId,
      agentId: assignment.agentId,
      handoffContext,
      data: result.data,
      hostId: params.hostId,
    });
    queuedRuns = persistedClaim.queuedRuns;
    claimNumber = persistedClaim.claimNumber;

    await logClaimSubmittedAudit({
      deps,
      session,
      tenantId,
      requestHeaders,
      claimId,
      data: result.data,
      assignment,
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

  return { success: true, claimId, claimNumber };
}

async function validateClaimFiles(
  files: CreateClaimValues['files'],
  session: ClaimsSession,
  tenantId: string,
  deps: ClaimsDeps
): Promise<void> {
  if (!files?.length) return;

  const context = getClaimFileValidationContext(session, tenantId);
  const validateSubmittedClaimFile = requireSubmittedClaimFileValidator(deps);

  for (const file of files) {
    validateClaimFileMetadata(file, context);
    await validateClaimFileObject(file, context, validateSubmittedClaimFile);
  }
}

type ClaimEvidenceFile = NonNullable<CreateClaimValues['files']>[number];
type SubmittedClaimFileValidator = NonNullable<ClaimsDeps['validateSubmittedClaimFile']>;

type ClaimFileValidationContext = {
  actorId: string;
  expectedBucket: string;
  expectedPrefix: string;
  tenantId: string;
};

const CLAIM_FILE_MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_CLAIM_FILE_TYPES = new Set([
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
  'audio/wav',
]);

function getClaimFileValidationContext(
  session: ClaimsSession,
  tenantId: string
): ClaimFileValidationContext {
  return {
    actorId: session.user.id,
    expectedBucket: process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence',
    expectedPrefix: `pii/tenants/${tenantId}/claims/${session.user.id}/`,
    tenantId,
  };
}

function requireSubmittedClaimFileValidator(deps: ClaimsDeps): SubmittedClaimFileValidator {
  if (!deps.validateSubmittedClaimFile) {
    throw new Error('Submitted claim file validation is not configured.');
  }

  return deps.validateSubmittedClaimFile;
}

function validateClaimFileMetadata(
  file: ClaimEvidenceFile,
  context: ClaimFileValidationContext
): void {
  if (file.bucket !== context.expectedBucket) {
    throw new ClaimValidationError(
      'Invalid file bucket. Evidence must be stored in the designated claim evidence bucket.',
      'INVALID_BUCKET'
    );
  }
  if (!file.path.startsWith(context.expectedPrefix)) {
    throw new ClaimValidationError(
      'Invalid file path detected. Evidence must be uploaded by the claimant.',
      'INVALID_PATH'
    );
  }
  if (file.size > CLAIM_FILE_MAX_SIZE) {
    throw new ClaimValidationError(
      `File too large: ${file.name}. Max size is 10MB.`,
      'INVALID_SIZE'
    );
  }
  if (!ALLOWED_CLAIM_FILE_TYPES.has(file.type)) {
    throw new ClaimValidationError(
      `Unsupported file type: ${file.type}. Allowed: PDF, TXT, Images, Audio.`,
      'INVALID_TYPE'
    );
  }
  if (!file.uploadIntentToken) {
    throw new ClaimValidationError(
      'Upload confirmation expired. Please retry upload.',
      'INVALID_PATH'
    );
  }
}

async function validateClaimFileObject(
  file: ClaimEvidenceFile,
  context: ClaimFileValidationContext,
  validateSubmittedClaimFile: SubmittedClaimFileValidator
): Promise<void> {
  try {
    await validateSubmittedClaimFile({
      actorId: context.actorId,
      file,
      tenantId: context.tenantId,
    });
  } catch (error) {
    if (error instanceof ClaimValidationError) {
      throw error;
    }

    throw new ClaimValidationError(
      error instanceof Error ? error.message : 'Uploaded file could not be verified.',
      'INVALID_PATH'
    );
  }
}
