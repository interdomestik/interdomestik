import { ensureClaimsAccess, type ClaimsSession } from '@/server/domains/claims/guards';
import { deriveClaimSlaPhase } from '@/features/claims/policy';
import { buildMemberClaimTrustSummary } from '@/features/claims/tracking/memberTrustSummary';
import {
  deriveCaseCompanionNextStep,
  buildRecoveryDecisionSnapshot,
  getMatterAllowanceVisibilityForUser,
  resolveClaimLifecycleReadProjection,
  toMemberSafeRecoveryDecision,
} from '@interdomestik/domain-claims';
import { db, ERASURE_REDACTED_VALUE } from '@interdomestik/database';
import { claimDocuments, claimEscalationAgreements, claims } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { and, desc, eq } from 'drizzle-orm';
import 'server-only';
import type { ClaimTrackingDetailDto } from '../types';
import { buildClaimVisibilityWhere } from '../utils';
import { mapMemberClaimDocuments } from './member-claim-documents';
import { getMemberTimelineFromDomainEvents } from './member-domain-event-timeline';
import { buildProgressSummary } from './member-progress-summary';
import { getMemberVaultConsentDisplay } from './getMemberVaultConsentDisplay';

export async function getMemberClaimDetail(
  session: ClaimsSession | null,
  claimId: string
): Promise<ClaimTrackingDetailDto | null> {
  return Sentry.withServerActionInstrumentation(
    'claims.tracking.detail',
    { recordResponse: true },
    async () => {
      const access = ensureClaimsAccess(session);
      const { tenantId, userId, role, branchId } = access;

      Sentry.setTag('tenantId', tenantId);
      Sentry.setTag('claimId', claimId);

      const visibilityCondition = buildClaimVisibilityWhere({
        tenantId,
        userId,
        role,
        branchId,
      });

      const whereClause = and(eq(claims.id, claimId), visibilityCondition);

      // db-access-guard: tenant-scoped -- reason: tenant predicate built by claim visibility helper before member claim detail lookup
      const claimQuery = db.query.claims.findFirst({
        where: whereClause,
        with: {
          documents: {
            orderBy: desc(claimDocuments.createdAt),
          },
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

      const claimStatus = resolveClaimLifecycleReadProjection(claim).status;
      const piiStatus =
        claim.userId === ERASURE_REDACTED_VALUE ? 'erased_or_unavailable' : 'available';
      const memberId = claim.userId ?? userId;
      const [matterAllowance, timeline, vaultConsentDisplay] = await Promise.all([
        getMatterAllowanceVisibilityForUser({ tenantId, userId: memberId }),
        getMemberTimelineFromDomainEvents({
          claimId: claim.id,
          tenantId,
          currentStatus: claimStatus,
          createdAt: claim.createdAt,
          piiStatus,
          updatedAt: claim.updatedAt,
        }),
        getMemberVaultConsentDisplay({
          tenantId,
          memberId,
          claimId: claim.id,
          claimCategory: claim.category ?? '',
          piiStatus,
        }),
      ]);
      const documents = mapMemberClaimDocuments(claim.documents);

      const recoveryDecision = toMemberSafeRecoveryDecision(
        buildRecoveryDecisionSnapshot({
          decidedAt: recoveryDecisionRows[0]?.acceptedAt,
          declineReasonCode: recoveryDecisionRows[0]?.declineReasonCode ?? null,
          decisionType: recoveryDecisionRows[0]?.decisionType ?? null,
          explanation: recoveryDecisionRows[0]?.decisionReason ?? null,
        })
      );

      const slaPhase = deriveClaimSlaPhase(claimStatus);
      const progressSummary = buildProgressSummary({
        status: claimStatus,
        timeline,
      });
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
        progressSummary,
        caseCompanionNextStep: deriveCaseCompanionNextStep({
          status: claimStatus,
          latestUpdateAt: progressSummary.latestUpdateAt,
          piiStatus,
        }),
        memberTrustSummary: buildMemberClaimTrustSummary({
          claimId: claim.id,
          status: claimStatus,
          slaPhase,
        }),
        matterAllowance,
        recoveryDecision,
        vaultConsentDisplay,
      };

      return dto;
    }
  );
}
