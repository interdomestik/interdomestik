import { validateClaimFiles } from './submit-evidence-validation';
import { ClaimValidationError } from './claim-validation-error';
export { ClaimValidationError } from './claim-validation-error';
import { claimDocuments, claims } from '@interdomestik/database';
import { generateClaimNumber } from '@interdomestik/database/claim-number';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { readTenantLocaleMetadata } from '@interdomestik/database/tenant-directory';
import { nanoid } from 'nanoid';
import { createClaimSchema, type CreateClaimValues } from '../validators/claims';
import type { QueuedClaimAiRun } from './ai-workflow-types';
import { buildClaimDocumentRows } from './documents';
import {
  buildClaimStartPublicNote,
  resolveSubmittedClaimIncidentCountry,
} from './incident-country';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import { loadClaimAssignmentContext } from './submit-assignment';
import {
  dispatchQueuedClaimAiRuns,
  logClaimSubmittedAudit,
  notifyClaimSubmitted,
} from './submit-side-effects';
import { recordSubmittedClaimLifecycle } from './submitted-claim-lifecycle';
import type { ClaimStartHandoffContext, ClaimsDeps, ClaimsSession } from './types';

async function persistSubmittedClaim(args: {
  authority: TenantAuthority;
  claimId: string;
  userId: string;
  createdAt: Date;
  changedByRole: string;
  hostId?: string | null;
  branchId: string | null;
  agentId: string | null;
  handoffContext?: ClaimStartHandoffContext | null;
  data: CreateClaimValues;
  tenantMetadata: { tenantId: string; code: string };
}): Promise<{ claimNumber: string; queuedRuns: QueuedClaimAiRun[] }> {
  const { title, description, category, companyName, claimAmount, currency, files } = args.data;
  const publicNote = buildClaimStartPublicNote(args.handoffContext);
  const incidentCountry = resolveSubmittedClaimIncidentCountry(args.data);
  const { tenantId } = readTenantAuthority(args.authority);
  let claimNumber = '';

  // One tenant-context transaction keeps the claim number, lifecycle, events and
  // documents atomic under installed tenant RLS settings.
  await withTenantAuthority(args.authority, async tx => {
    await tx.insert(claims).values({
      id: args.claimId,
      tenantId,
      userId: args.userId,
      branchId: args.branchId,
      agentId: args.agentId,
      title,
      description: description || undefined,
      category,
      companyName,
      claimAmount: claimAmount || undefined,
      currency: currency || 'EUR',
      ...mapClaimStatusToLifecycleStates('submitted'),
      ...incidentCountry,
      claimNumber: null,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    });

    claimNumber = await generateClaimNumber(
      tx,
      {
        tenantId,
        claimId: args.claimId,
        createdAt: args.createdAt,
      },
      args.tenantMetadata
    );

    await recordSubmittedClaimLifecycle(tx, {
      changedByRole: args.changedByRole,
      claimId: args.claimId,
      createdAt: args.createdAt,
      data: args.data,
      hostId: args.hostId,
      publicNote,
      tenantId,
      userId: args.userId,
    });

    if (!files?.length) {
      return;
    }

    const documentRows = buildClaimDocumentRows({
      claimId: args.claimId,
      uploadedBy: args.userId,
      files,
      tenantId,
    });

    await tx.insert(claimDocuments).values(documentRows);
  });

  return {
    claimNumber,
    queuedRuns: [],
  };
}

export async function submitClaimCore(
  params: {
    authority: TenantAuthority | null;
    session: ClaimsSession | null;
    requestHeaders: Headers;
    hostId?: string | null;
    trustedClaimId?: string;
    data: CreateClaimValues;
    handoffContext?: ClaimStartHandoffContext | null;
  },
  deps: ClaimsDeps = {}
) {
  const { authority, session, requestHeaders, data, handoffContext } = params;

  if (!session || !authority) {
    throw new ClaimValidationError('Unauthorized', 'UNAUTHORIZED');
  }

  const { tenantId } = readTenantAuthority(authority);
  const assignment = await loadClaimAssignmentContext(session.user.id, authority);
  if (!assignment.subscription) {
    throw new ClaimValidationError('Membership required to file a claim.', 'MEMBERSHIP_REQUIRED');
  }
  const result = createClaimSchema.safeParse(data);
  if (!result.success) {
    throw new ClaimValidationError('Validation failed', 'INVALID_PAYLOAD');
  }

  await validateClaimFiles(result.data.files, session, tenantId, deps);

  const claimId = params.trustedClaimId ?? nanoid();
  const createdAt = new Date();
  let queuedRuns: QueuedClaimAiRun[];
  let claimNumber = '';

  try {
    // The tenant directory is deny-all to the runtime RLS role, so the
    // authoritative tenant code is prepared on its own connection before the
    // persistence transaction opens, never inside it.
    const tenantCode = (await readTenantLocaleMetadata(tenantId))?.code?.trim();
    if (!tenantCode) {
      throw new Error(`Tenant code not found for tenantId: ${tenantId}`);
    }

    const persistedClaim = await persistSubmittedClaim({
      authority,
      claimId,
      tenantMetadata: { tenantId, code: tenantCode },
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
      authority,
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

  notifyClaimSubmitted({ deps, session, authority, claimId, data: result.data });

  if (deps.revalidatePath) {
    await deps.revalidatePath('/member/claims');
  }

  return { success: true, claimId, claimNumber };
}
