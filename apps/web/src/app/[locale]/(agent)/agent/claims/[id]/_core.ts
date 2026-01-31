import type {
  ClaimTimelineEvent,
  ClaimTrackingDetailDto,
  ClaimTrackingDocument,
} from '@/features/claims/tracking/types';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import {
  agentClients,
  claimDocuments,
  claims,
  claimStageHistory,
} from '@interdomestik/database/schema';
import { and, desc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

export async function getAgentClaimDetail(
  agentId: string,
  claimId: string
): Promise<ClaimTrackingDetailDto> {
  // 1. Fetch claim to get properties and memberId
  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
    with: {
      documents: {
        orderBy: desc(claimDocuments.createdAt),
      },
    },
  });

  if (!claim) {
    notFound();
  }

  // 2. Verify Agent Access (Must be a client of this agent)
  const clientRecord = await db.query.agentClients.findFirst({
    where: and(eq(agentClients.agentId, agentId), eq(agentClients.memberId, claim.memberId)),
  });

  if (!clientRecord) {
    // Agent does not represent this member.
    notFound();
  }

  // 3. Fetch Timeline (Public events only, similar to Member view)
  const timelineRows = await db
    .select()
    .from(claimStageHistory)
    .where(and(eq(claimStageHistory.claimId, claimId), eq(claimStageHistory.isPublic, true)))
    .orderBy(desc(claimStageHistory.createdAt));

  // 4. Map to DTO
  const timeline: ClaimTimelineEvent[] = timelineRows.map(row => ({
    id: row.id,
    date: row.createdAt ?? new Date(),
    statusFrom: row.fromStatus || null,
    statusTo: row.toStatus,
    labelKey: `claims-tracking.status.${row.toStatus}`,
    note: row.note,
    isPublic: row.isPublic,
  }));

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
    statusLabelKey: `claims-tracking.status.${claim.status}`,
    createdAt: claim.createdAt ?? new Date(),
    updatedAt: claim.updatedAt,
    description: claim.description,
    amount: claim.claimAmount ? claim.claimAmount.toString() : null,
    currency: claim.currency || 'EUR',
    documents,
    timeline,
    canShare: false, // Agents don't need share button usually
  };

  return dto;
}
