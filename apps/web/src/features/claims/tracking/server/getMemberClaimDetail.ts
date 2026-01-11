import { ensureClaimsAccess } from '@/server/domains/claims/guards';
import { db } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { claimDocuments, claims, claimStageHistory } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { and, desc, eq } from 'drizzle-orm';
import 'server-only';
import type { ClaimTimelineEvent, ClaimTrackingDetailDto, ClaimTrackingDocument } from '../types';
import { buildClaimVisibilityWhere } from '../utils';

export async function getMemberClaimDetail(
  session: any,
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
      const claimQuery = db.query.claims.findFirst({
        where: whereClause,
        with: {
          documents: {
            orderBy: desc(claimDocuments.createdAt),
          },
          // We can fetch stage history or separate query
        },
      });

      const timelineQuery = db
        .select()
        .from(claimStageHistory)
        .where(
          and(
            eq(claimStageHistory.claimId, claimId),
            eq(claimStageHistory.isPublic, true) // Only public events for member tracking
          )
        )
        .orderBy(desc(claimStageHistory.createdAt));

      const [claim, timelineRows] = await Promise.all([claimQuery, timelineQuery]);

      if (!claim) {
        return null;
      }

      // 4. Map to DTO
      const timeline: ClaimTimelineEvent[] = timelineRows.map(row => ({
        id: row.id,
        date: row.createdAt ?? new Date(),
        statusFrom: row.fromStatus || null,
        statusTo: row.toStatus,
        labelKey: `claims.status.${row.toStatus}`,
        note: row.note,
        isPublic: row.isPublic,
      }));

      // Add "Created" event if missing from history (often implicit)
      if (
        claim.createdAt &&
        !timeline.find(e => e.statusTo === 'draft' || e.statusTo === 'submitted')
      ) {
        // Optionally inject creation event
      }

      const documents: ClaimTrackingDocument[] = claim.documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        createdAt: doc.createdAt ?? new Date(),
        fileType: doc.fileType,
        fileSize: doc.fileSize,
      }));

      const dto: ClaimTrackingDetailDto = {
        id: claim.id,
        title: claim.title,
        status: (claim.status || 'draft') as ClaimStatus,
        statusLabelKey: `claims.status.${claim.status}`,
        createdAt: claim.createdAt ?? new Date(),
        updatedAt: claim.updatedAt,
        description: claim.description,
        amount: claim.claimAmount ? claim.claimAmount.toString() : null,
        currency: claim.currency || 'EUR',
        documents,
        timeline,
        canShare: true, // TODO: Logic for enabling share button
      };

      return dto;
    }
  );
}
