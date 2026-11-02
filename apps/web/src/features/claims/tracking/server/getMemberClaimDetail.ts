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
import { ERASURE_REDACTED_VALUE } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import {
  claimDocuments,
  claimEscalationAgreements,
  claims,
  domainEvents,
} from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { and, desc, eq } from 'drizzle-orm';
import 'server-only';
import type { ClaimTrackingDetailDto } from '../types';
import { buildClaimVisibilityWhere } from '../utils';
import { mapMemberClaimDocuments } from './member-claim-documents';
import { getMemberTimelineFromDomainEvents } from './member-domain-event-timeline';
import { buildProgressSummary } from './member-progress-summary';
import {
  sanitizeMemberRecoveryTimeline,
  verifiedRecoveryDecisionAt,
} from './member-recovery-timeline';
import { getMemberVaultConsentDisplay } from './getMemberVaultConsentDisplay';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getMemberClaimDetail(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  claimId: string
): Promise<ClaimTrackingDetailDto | null> {
  return Sentry.withServerActionInstrumentation(
    'claims.tracking.detail',
    { recordResponse: false },
    async () => {
      const access = ensureClaimsAccess(session);
      const { tenantId, userId, role, branchId } = access;

      // Fail closed unless the session's tenant is the tenant the authority grants.
      if (!authority || readTenantAuthority(authority).tenantId !== tenantId) {
        throw new UnauthorizedError();
      }

      Sentry.setTag('tenantId', tenantId);
      Sentry.setTag('claimId', claimId);

      const visibilityCondition = buildClaimVisibilityWhere({
        tenantId,
        userId,
        role,
        branchId,
      });

      return withTenantAuthority(authority, async db => {
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
            decisionEventAt: domainEvents.createdAt,
            decisionEventPayload: domainEvents.payload,
          })
          .from(claimEscalationAgreements)
          .leftJoin(
            domainEvents,
            and(
              eq(domainEvents.tenantId, tenantId),
              eq(domainEvents.entityId, claimEscalationAgreements.claimId),
              eq(domainEvents.entityType, 'claim'),
              eq(domainEvents.eventName, 'recovery.decision_recorded'),
              eq(domainEvents.eventVersion, 1)
            )
          )
          .where(
            and(
              eq(claimEscalationAgreements.claimId, claimId),
              eq(claimEscalationAgreements.tenantId, tenantId)
            )
          )
          .orderBy(desc(domainEvents.createdAt), desc(domainEvents.id))
          .limit(2);

        const claim = await claimQuery;

        if (!claim) {
          return null;
        }

        const claimStatus = resolveClaimLifecycleReadProjection(claim).status;
        const piiStatus =
          claim.userId === ERASURE_REDACTED_VALUE ? 'erased_or_unavailable' : 'available';
        const memberId = claim.userId ?? userId;
        const [matterAllowance, timeline, vaultConsentDisplay] = await Promise.all([
          getMatterAllowanceVisibilityForUser({ tenantId, userId: memberId, tx: db }),
          getMemberTimelineFromDomainEvents(
            {
              claimId: claim.id,
              tenantId,
              currentStatus: claimStatus,
              createdAt: claim.createdAt,
              piiStatus,
              updatedAt: claim.updatedAt,
            },
            authority,
            db
          ),
          getMemberVaultConsentDisplay(
            {
              memberId,
              claimId: claim.id,
              claimCategory: claim.category ?? '',
              piiStatus,
            },
            authority,
            db
          ),
        ]);
        // Read status notes before the current decision, so a concurrent sensitive write
        // cannot add a note after the decision snapshot used to classify it.
        const recoveryDecisionRows = await recoveryDecisionQuery;
        const currentDecision = recoveryDecisionRows[0] ?? null;
        const publicTimeline = sanitizeMemberRecoveryTimeline(
          timeline,
          currentDecision
            ? {
                ...currentDecision,
                decisionRecordedAt: verifiedRecoveryDecisionAt(recoveryDecisionRows),
              }
            : null
        );
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
          timeline: publicTimeline,
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
          timeline: publicTimeline,
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
      });
    }
  );
}
