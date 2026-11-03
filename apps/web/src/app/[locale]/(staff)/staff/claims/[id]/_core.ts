import { deriveClaimSlaPhase } from '@/features/claims/policy';
import { buildStaffClaimReadScope } from '@interdomestik/domain-claims/staff-claims/scope';
import { claimDocuments, claimStageHistory, claims, eq, user } from '@interdomestik/database';
import type { db } from '@interdomestik/database/db';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { and, desc, isNotNull } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  staffId: string;
  authority: TenantAuthority;
}): Promise<StaffClaimDetailsResult> {
  const { tenantId } = readTenantAuthority(args.authority);
  const claim = await withTenantAuthority(args.authority, tx =>
    tx.query.claims.findFirst({
      where: and(
        eq(claims.tenantId, tenantId),
        buildStaffClaimReadScope({
          branchId: args.branchId ?? null,
          claimId: args.claimId,
          userId: args.staffId,
        })
      ),
      with: {
        user: true,
      },
    })
  );

  if (!claim) return { kind: 'not_found' };

  const status = claimStatusFromLifecycleFields(claim);

  const [documents, stageHistory] = await Promise.all([
    withTenantAuthority(args.authority, tx =>
      tx
        .select({
          id: claimDocuments.id,
          name: claimDocuments.name,
          fileSize: claimDocuments.fileSize,
          fileType: claimDocuments.fileType,
          createdAt: claimDocuments.createdAt,
        })
        .from(claimDocuments)
        .where(and(eq(claimDocuments.claimId, args.claimId), eq(claimDocuments.tenantId, tenantId)))
    ),
    withTenantAuthority(args.authority, tx =>
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
          and(eq(claimStageHistory.claimId, args.claimId), eq(claimStageHistory.tenantId, tenantId))
        )
        .orderBy(desc(claimStageHistory.createdAt))
    ),
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
}

// Called only after the page's staff/branch and claim-scope authorization succeeds.
export function getPublicStatusHistoryCore(args: {
  claimId: string;
  authority: TenantAuthority;
}): Promise<Array<LatestPublicStatusNote & { id: string; toStatus: string | null }>> {
  const { tenantId } = readTenantAuthority(args.authority);
  return withTenantAuthority(args.authority, tx =>
    tx.query.claimStageHistory.findMany({
      where: and(
        eq(claimStageHistory.claimId, args.claimId),
        eq(claimStageHistory.tenantId, tenantId),
        eq(claimStageHistory.isPublic, true)
      ),
      columns: { id: true, note: true, toStatus: true, createdAt: true },
      orderBy: [desc(claimStageHistory.createdAt), desc(claimStageHistory.id)],
    })
  );
}

export async function getLatestPublicStatusNoteCore(args: {
  claimId: string;
  authority: TenantAuthority;
}): Promise<LatestPublicStatusNote | null> {
  const { tenantId } = readTenantAuthority(args.authority);
  const row = await withTenantAuthority(args.authority, tx =>
    tx.query.claimStageHistory.findFirst({
      where: and(
        eq(claimStageHistory.claimId, args.claimId),
        eq(claimStageHistory.tenantId, tenantId),
        eq(claimStageHistory.isPublic, true),
        isNotNull(claimStageHistory.note)
      ),
      columns: {
        note: true,
        createdAt: true,
      },
      orderBy: [desc(claimStageHistory.createdAt)],
    })
  );
  return row ?? null;
}

type ClaimWithUser = NonNullable<Awaited<ReturnType<typeof db.query.claims.findFirst>>> & {
  status: ClaimStatus;
};
