import { ensureClaimsAccess, type ClaimsSession } from '@/server/domains/claims/guards';
import { deriveClaimSlaPhase } from '@/features/claims/policy';
import { buildMemberClaimTrustSummary } from '@/features/claims/tracking/memberTrustSummary';
import {
  getMatterAllowanceVisibilityForUser,
  buildRecoveryDecisionSnapshot,
  resolveClaimLifecycleReadProjection,
  toMemberSafeRecoveryDecision,
} from '@interdomestik/domain-claims';
import { db, ERASURE_REDACTED_VALUE } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { claimDocuments, claimEscalationAgreements, claims } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { and, desc, eq } from 'drizzle-orm';
import 'server-only';
import type {
  ClaimProgressSummaryDto,
  ClaimTimelineEvent,
  ClaimTrackingDetailDto,
  ClaimTrackingDocument,
} from '../types';
import { buildClaimVisibilityWhere } from '../utils';
import { getMemberTimelineFromDomainEvents } from './member-domain-event-timeline';

function buildProgressSummary(args: {
  status: ClaimStatus;
  timeline: ClaimTimelineEvent[];
}): ClaimProgressSummaryDto {
  const currentStatusLabelKey = `claims-tracking.status.${args.status}`;
  const latestUpdate = args.timeline[0];

  if (!latestUpdate) {
    throw new Error('buildProgressSummary requires a non-empty timeline');
  }

  return {
    currentStatusLabelKey,
    latestUpdateAt: latestUpdate.date,
    latestUpdateLabelKey: latestUpdate.labelKey,
    latestUpdateNote: latestUpdate.note,
    nextStepKey: `claims-tracking.status.next_step.${args.status}`,
  };
}

export async function getMemberClaimDetail(
  session: ClaimsSession | null,
  claimId: string
): Promise<ClaimTrackingDetailDto | null> {
  return Sentry.withServerActionInstrumentation(
    'claims.tracking.detail',
    { recordResponse: true },
    async () => {
      // 1. Auth & Context
      const access = ensureClaimsAccess(session);
      const { tenantId, userId, role, branchId } = access;

      Sentry.setTag('tenantId', tenantId);
      Sentry.setTag('claimId', claimId);

      // TODO: Fetch agent's members if role is agent
      // For now, we rely on direct assignment or fallback in Utils.

      // 2. Build Query
      const visibilityCondition = buildClaimVisibilityWhere({
        tenantId,
        userId,
        role,
        branchId,
        // agentMemberIds: ... // fetch if needed
      });

      const whereClause = and(eq(claims.id, claimId), visibilityCondition);

      // 3. Fetch Data (Parallel)
      // db-access-guard: tenant-scoped -- reason: tenant predicate built by claim visibility helper before member claim detail lookup
      const claimQuery = db.query.claims.findFirst({
        where: whereClause,
        with: {
          documents: {
            orderBy: desc(claimDocuments.createdAt),
          },
          // We can fetch stage history or separate query
        },
      });

      const recoveryDecisionQuery = db
        .select({
          acceptedAt: claimEscalationAgreements.acceptedAt,
          decisionReason: claimEscalationAgreements.decisionReason,
          decisionType: claimEscalationAgreements.decisionType,
          declineReasonCode: claimEscalationAgreements.declineReasonCode,
        })
        .from(claimEscalationAgreements)
        .where(
          and(
            eq(claimEscalationAgreements.claimId, claimId),
            eq(claimEscalationAgreements.tenantId, tenantId)
          )
        )
        .limit(1);

      const [claim, recoveryDecisionRows] = await Promise.all([claimQuery, recoveryDecisionQuery]);

      if (!claim) {
        return null;
      }

      const matterAllowance = await getMatterAllowanceVisibilityForUser({
        tenantId,
        userId: claim.userId ?? userId,
      });

      const claimStatus = resolveClaimLifecycleReadProjection(claim).status;
      const timeline = await getMemberTimelineFromDomainEvents({
        claimId: claim.id,
        tenantId,
        currentStatus: claimStatus,
        createdAt: claim.createdAt,
        piiStatus: claim.userId === ERASURE_REDACTED_VALUE ? 'erased_or_unavailable' : 'available',
        updatedAt: claim.updatedAt,
      });

      const documents: ClaimTrackingDocument[] = claim.documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        createdAt: doc.createdAt ?? new Date(),
        fileType: doc.fileType,
        fileSize: doc.fileSize,
      }));

      const recoveryDecision = toMemberSafeRecoveryDecision(
        buildRecoveryDecisionSnapshot({
          decidedAt: recoveryDecisionRows[0]?.acceptedAt,
          declineReasonCode: recoveryDecisionRows[0]?.declineReasonCode ?? null,
          decisionType: recoveryDecisionRows[0]?.decisionType ?? null,
          explanation: recoveryDecisionRows[0]?.decisionReason ?? null,
        })
      );

      const slaPhase = deriveClaimSlaPhase(claimStatus);
      const dto: ClaimTrackingDetailDto = {
        id: claim.id,
        title: claim.title,
        status: claimStatus,
        slaPhase,
        statusLabelKey: `claims-tracking.status.${claimStatus}`,
        createdAt: claim.createdAt ?? new Date(),
        updatedAt: claim.updatedAt,
        description: claim.description,
        amount: claim.claimAmount ? claim.claimAmount.toString() : null,
        currency: claim.currency || 'EUR',
        documents,
        timeline,
        canShare: true, // TODO: Logic for enabling share button
        progressSummary: buildProgressSummary({
          status: claimStatus,
          timeline,
        }),
        memberTrustSummary: buildMemberClaimTrustSummary({
          claimId: claim.id,
          status: claimStatus,
          slaPhase,
        }),
        matterAllowance,
        recoveryDecision,
      };

      return dto;
    }
  );
}
