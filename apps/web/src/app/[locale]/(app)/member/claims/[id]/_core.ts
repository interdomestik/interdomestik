import { claimDocuments, claimStageHistory, claims, eq } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, desc } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export function toClaimStatus(value: unknown): ClaimStatus {
  return CLAIM_STATUSES.includes(value as ClaimStatus) ? (value as ClaimStatus) : 'draft';
}

export type MemberClaimRedirect =
  { kind: 'redirect'; href: string } | { kind: 'not_found' } | { kind: 'continue' };

export function getMemberClaimRedirect(args: {
  role: string | null | undefined;
  claimId: string;
}): MemberClaimRedirect {
  const { role, claimId } = args;

  if (role === 'user') return { kind: 'continue' };
  if (role === 'staff') return { kind: 'redirect', href: `/staff/claims/${claimId}` };
  if (role === 'admin') return { kind: 'redirect', href: `/admin/claims/${claimId}` };
  if (role === 'agent') return { kind: 'redirect', href: `/agent` };

  return { kind: 'not_found' };
}

type ClaimWithUser = typeof claims.$inferSelect & {
  user?: unknown;
};

export type MemberClaimDocument = {
  id: string;
  name: string;
  fileSize: number;
  fileType: string;
  createdAt: Date;
};

export type MemberClaimStageHistory = {
  toStatus: ClaimStatus;
  createdAt: Date;
};

export type MemberClaimDetailsResult =
  | {
      kind: 'ok';
      claim: ClaimWithUser;
      documents: MemberClaimDocument[];
      publicStageHistory: MemberClaimStageHistory[];
    }
  | { kind: 'not_found' };

export async function getMemberClaimDetailsCore(args: {
  claimId: string;
  viewerUserId: string;
  authority: TenantAuthority;
}): Promise<MemberClaimDetailsResult> {
  const { claimId, authority, viewerUserId } = args;
  const { tenantId: viewerTenantId } = readTenantAuthority(authority);

  const claim = (await withTenantAuthority(authority, tx =>
    tx.query.claims.findFirst({
      where: and(eq(claims.id, claimId), eq(claims.tenantId, viewerTenantId)),
      with: { user: true },
    })
  )) as ClaimWithUser | null | undefined;

  if (!claim) return { kind: 'not_found' };
  if (claim.userId !== viewerUserId) return { kind: 'not_found' };
  const tenantId = claim.tenantId;
  if (!tenantId) return { kind: 'not_found' };

  const documents = await withTenantAuthority(authority, tx =>
    tx
      .select({
        id: claimDocuments.id,
        name: claimDocuments.name,
        fileSize: claimDocuments.fileSize,
        fileType: claimDocuments.fileType,
        createdAt: claimDocuments.createdAt,
      })
      .from(claimDocuments)
      .where(and(eq(claimDocuments.claimId, claimId), eq(claimDocuments.tenantId, tenantId)))
  );

  const publicStageHistoryRows = await withTenantAuthority(authority, tx =>
    tx
      .select({
        toStatus: claimStageHistory.toStatus,
        createdAt: claimStageHistory.createdAt,
      })
      .from(claimStageHistory)
      .where(
        and(
          eq(claimStageHistory.claimId, claimId),
          eq(claimStageHistory.tenantId, tenantId),
          eq(claimStageHistory.isPublic, true)
        )
      )
      .orderBy(desc(claimStageHistory.createdAt))
  );

  const normalizedDocuments: MemberClaimDocument[] = (
    documents as Array<{
      id: string;
      name: string | null;
      fileSize: number | null;
      fileType: string | null;
      createdAt: Date | null;
    }>
  ).map(d => ({
    id: d.id,
    name: d.name ?? 'document',
    fileSize: d.fileSize ?? 0,
    fileType: d.fileType ?? 'unknown',
    createdAt: d.createdAt ?? new Date(),
  }));

  const normalizedHistory = publicStageHistoryRows
    .filter(row => !!row.createdAt)
    .map(row => ({
      toStatus: toClaimStatus(row.toStatus),
      createdAt: row.createdAt as Date,
    }));

  return {
    kind: 'ok',
    claim,
    documents: normalizedDocuments,
    publicStageHistory: normalizedHistory,
  };
}
