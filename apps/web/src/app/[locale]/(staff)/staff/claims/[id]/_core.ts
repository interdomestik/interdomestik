import { claimDocuments, claimStageHistory, claims, db, eq, user } from '@interdomestik/database';
import { and, desc, isNotNull } from 'drizzle-orm';

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
  documents: StaffClaimDocument[];
  stageHistory: StaffClaimStageHistoryEntry[];
};

export type StaffClaimDetailsResult = { kind: 'not_found' } | StaffClaimDetailsOk;

export type LatestPublicStatusNote = {
  note: string | null;
  createdAt: Date | null;
};

export async function getStaffClaimDetailsCore(args: {
  claimId: string;
}): Promise<StaffClaimDetailsResult> {
  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, args.claimId),
    with: {
      user: true,
    },
  });

  if (!claim) return { kind: 'not_found' };

  const [documents, stageHistory] = await Promise.all([
    db
      .select({
        id: claimDocuments.id,
        name: claimDocuments.name,
        fileSize: claimDocuments.fileSize,
        fileType: claimDocuments.fileType,
        createdAt: claimDocuments.createdAt,
      })
      .from(claimDocuments)
      .where(eq(claimDocuments.claimId, args.claimId)),
    db
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
      .where(eq(claimStageHistory.claimId, args.claimId))
      .orderBy(desc(claimStageHistory.createdAt)),
  ]);

  return {
    kind: 'ok',
    claim,
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

export async function getLatestPublicStatusNoteCore(args: {
  claimId: string;
  tenantId: string;
}): Promise<LatestPublicStatusNote | null> {
  const row = await db.query.claimStageHistory.findFirst({
    where: and(
      eq(claimStageHistory.claimId, args.claimId),
      eq(claimStageHistory.tenantId, args.tenantId),
      eq(claimStageHistory.isPublic, true),
      isNotNull(claimStageHistory.note)
    ),
    columns: {
      note: true,
      createdAt: true,
    },
    orderBy: [desc(claimStageHistory.createdAt)],
  });
  return row ?? null;
}

type ClaimWithUser = NonNullable<Awaited<ReturnType<typeof db.query.claims.findFirst>>>;
