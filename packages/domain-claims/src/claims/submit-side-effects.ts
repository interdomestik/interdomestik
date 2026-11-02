import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import type { CreateClaimValues } from '../validators/claims';
import type { QueuedClaimAiRun } from './ai-workflow-types';
import type { ClaimAssignmentContext } from './submit-assignment';
import type { ClaimsDeps, ClaimsSession } from './types';
import { forEachInOrder } from '../in-order';

export async function logClaimSubmittedAudit(args: {
  deps: ClaimsDeps;
  session: ClaimsSession;
  authority: TenantAuthority;
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
    authority: args.authority,
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

export async function dispatchQueuedClaimAiRuns(
  queuedRuns: QueuedClaimAiRun[],
  deps: ClaimsDeps
): Promise<void> {
  const dispatchClaimAiRun = deps.dispatchClaimAiRun;
  if (!dispatchClaimAiRun) {
    return;
  }

  await forEachInOrder(queuedRuns, async queuedRun => {
    try {
      await dispatchClaimAiRun(queuedRun);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to dispatch claim AI run.';
      if (deps.markClaimAiRunDispatchFailed) {
        await deps.markClaimAiRunDispatchFailed({
          runId: queuedRun.runId,
          message,
        });
      }
    }
  });
}

export function notifyClaimSubmitted(args: {
  deps: ClaimsDeps;
  session: ClaimsSession;
  authority: TenantAuthority;
  claimId: string;
  data: CreateClaimValues;
}) {
  if (!args.deps.notifyClaimSubmitted) {
    return;
  }

  Promise.resolve(
    args.deps.notifyClaimSubmitted(
      args.session.user.id,
      args.session.user.email || '',
      {
        id: args.claimId,
        title: args.data.title,
        category: args.data.category,
      },
      { authority: args.authority }
    )
  ).catch((err: Error) => console.error('Failed to send claim submitted notification:', err));
}
