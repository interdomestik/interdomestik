import { deriveClaimSlaPhase } from '@/features/claims/policy';
import { buildStaffClaimReadScope } from '@interdomestik/domain-claims/staff-claims/scope';
import {
  claimDocuments,
  claimStageHistory,
  claims,
  db,
  eq,
  user,
  withTenantContext,
} from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { and, desc } from 'drizzle-orm';

export type StaffClaimDocument = {
  id: string;
  fileName: string;
  fileSize: number | null;
  fileType: string | null;
  createdAt: Date | null;
};

export type StaffClaimStageHistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  isPublic: boolean | null;
  createdAt: Date | null;
  changedByName: string | null;
  changedByEmail: string | null;
};

export type StaffClaimDetailsOk = {
  kind: 'ok';
  claim: ClaimWithUser;
  slaPhase: ReturnType<typeof deriveClaimSlaPhase>;
  documents: StaffClaimDocument[];
  stageHistory: StaffClaimStageHistoryEntry[];
};

export type StaffClaimDetailsResult = { kind: 'not_found' } | StaffClaimDetailsOk;

export type LatestPublicStatusNote = {
  note: string | null;
  createdAt: Date | null;
};

export async function getStaffClaimDetailsCore(args: {
  branchId?: string | null;
  claimId: string;
  role: 'staff';
  staffId: string;
  tenantId: string;
}): Promise<StaffClaimDetailsResult> {
  if (args.role !== 'staff') return { kind: 'not_found' };

  return withTenantContext({ tenantId: args.tenantId, role: args.role }, async tx => {
    const claim = await tx.query.claims.findFirst({
      where: and(
        eq(claims.tenantId, args.tenantId),
        buildStaffClaimReadScope({
          branchId: args.branchId ?? null,
          claimId: args.claimId,
          userId: args.staffId,
        })
      ),
      with: {
        user: true,
      },
    });

    if (!claim) return { kind: 'not_found' };

    const status = claimStatusFromLifecycleFields(claim);

    const [documents, stageHistory] = await Promise.all([
      tx
        .select({
          id: claimDocuments.id,
          name: claimDocuments.name,
          fileSize: claimDocuments.fileSize,
          fileType: claimDocuments.fileType,
          createdAt: claimDocuments.createdAt,
        })
        .from(claimDocuments)
        .where(
          and(eq(claimDocuments.claimId, args.claimId), eq(claimDocuments.tenantId, args.tenantId))
        ),
      tx
        .select({
          id: claimStageHistory.id,
          fromStatus: claimStageHistory.fromStatus,
          toStatus: claimStageHistory.toStatus,
          note: claimStageHistory.note,
          isPublic: claimStageHistory.isPublic,
          createdAt: claimStageHistory.createdAt,
          changedByName: user.name,
          changedByEmail: user.email,
        })
        .from(claimStageHistory)
        .leftJoin(user, eq(claimStageHistory.changedById, user.id))
        .where(
          and(
            eq(claimStageHistory.claimId, args.claimId),
            eq(claimStageHistory.tenantId, args.tenantId)
          )
        )
        .orderBy(desc(claimStageHistory.createdAt)),
    ]);

    return {
      kind: 'ok',
      claim: { ...claim, status },
      slaPhase: deriveClaimSlaPhase(status),
      documents: documents.map(doc => ({
        id: doc.id,
        fileName: doc.name,
        fileSize: doc.fileSize,
        fileType: doc.fileType,
        createdAt: doc.createdAt,
      })),
      stageHistory,
    };
  });
}

// Called only after the page's staff/branch and claim-scope authorization succeeds.
export function getPublicStatusHistoryCore(args: {
  claimId: string;
  role: 'staff' | 'branch_manager';
  tenantId: string;
}): Promise<Array<LatestPublicStatusNote & { id: string; toStatus: string | null }>> {
  if (args.role !== 'staff' && args.role !== 'branch_manager') return Promise.resolve([]);

  return withTenantContext({ tenantId: args.tenantId, role: args.role }, tx =>
    tx.query.claimStageHistory.findMany({
      where: and(
        eq(claimStageHistory.claimId, args.claimId),
        eq(claimStageHistory.tenantId, args.tenantId),
        eq(claimStageHistory.isPublic, true)
      ),
      columns: { id: true, note: true, toStatus: true, createdAt: true },
      orderBy: [desc(claimStageHistory.createdAt), desc(claimStageHistory.id)],
    })
  );
}

type ClaimWithUser = NonNullable<Awaited<ReturnType<typeof db.query.claims.findFirst>>> & {
  status: ClaimStatus;
};
