import { auth } from '@/lib/auth';
import {
  and,
  claimDocuments,
  claims,
  createAdminClient,
  db,
  eq,
  user,
} from '@interdomestik/database';
import { ClaimStatus } from '@interdomestik/database/constants';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { mapClaimToOperationalRow, RawClaimRow } from '../mappers/mapClaimToOperationalRow';
import { ClaimOpsDetail } from '../types';

export type OpsClaimDetailResult = { kind: 'not_found' } | { kind: 'ok'; data: ClaimOpsDetail };

// Local helper type for the query result with relations
type ClaimWithRelations = typeof claims.$inferSelect & {
  staff: { name: string; email: string } | null;
  branch: { id: string; code: string; name: string } | null;
  // agent: manually fetched
};

export async function getOpsClaimDetail(claimId: string): Promise<OpsClaimDetailResult> {
  // 0. Get tenant context (P0 fix: tenant guard)
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { kind: 'not_found' };
  const tenantId = ensureTenantId(session);

  // 1. Fetch Claim + Relations with tenant guard
  const claim = (await db.query.claims.findFirst({
    where: and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)),
    with: {
      staff: {
        columns: {
          name: true,
          email: true,
        },
      },
      branch: {
        columns: {
          id: true,
          code: true,
          name: true,
        },
      },
      // Note: agent fetched separately as relation inference is tricky without schema export
    },
  })) as unknown as ClaimWithRelations | undefined;

  if (!claim) return { kind: 'not_found' };

  // 1b. Fetch User (Claimant) & Agent separately
  const [userData] = await db.select().from(user).where(eq(user.id, claim.userId)).limit(1);

  let agentData: { name: string } | null = null;
  if (claim.agentId) {
    const [a] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, claim.agentId))
      .limit(1);
    agentData = a ? { name: a.name } : null;
  }

  // 2. Fetch Documents
  const rawDocs = await db
    .select({
      id: claimDocuments.id,
      name: claimDocuments.name,
      fileSize: claimDocuments.fileSize,
      fileType: claimDocuments.fileType,
      createdAt: claimDocuments.createdAt,
      filePath: claimDocuments.filePath,
      bucket: claimDocuments.bucket,
    })
    .from(claimDocuments)
    .where(eq(claimDocuments.claimId, claimId));

  const adminClient = createAdminClient();
  const docs = await Promise.all(
    rawDocs.map(async doc => {
      const { data } = await adminClient.storage
        .from(doc.bucket)
        .createSignedUrl(doc.filePath, 60 * 60); // 1 hour link
      return {
        id: doc.id,
        name: doc.name,
        fileSize: doc.fileSize,
        fileType: doc.fileType,
        createdAt: doc.createdAt,
        url: data?.signedUrl ?? '',
      };
    })
  );

  // 3. Map to Operational Row
  const rawRow: RawClaimRow = {
    claim: {
      id: claim.id,
      title: claim.title,
      status: claim.status as ClaimStatus,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      assignedAt: claim.assignedAt,
      userId: claim.userId,
      claimNumber: claim.claimNumber,
      staffId: claim.staffId,
      category: claim.category,
      currency: claim.currency,
      statusUpdatedAt: claim.statusUpdatedAt,
      origin: claim.origin,
      originRefId: claim.originRefId,
    },
    claimant: userData
      ? {
          name: userData.name,
          email: userData.email,
          memberNumber: userData.memberNumber,
        }
      : null,
    staff: claim.staff
      ? {
          name: claim.staff.name,
          email: claim.staff.email,
        }
      : null,
    branch: claim.branch
      ? {
          id: claim.branch.id,
          code: claim.branch.code,
          name: claim.branch.name,
        }
      : null,
    agent: agentData
      ? {
          name: agentData.name,
        }
      : null,
  };

  const opsRow = mapClaimToOperationalRow(rawRow);

  // 4. Return combined Detail
  const detail: ClaimOpsDetail = {
    ...opsRow,
    description: claim.description,
    docs,
    companyName: claim.companyName,
    claimAmount: claim.claimAmount ? String(claim.claimAmount) : null,
    currency: claim.currency,
    createdAt: claim.createdAt,
  };

  return { kind: 'ok', data: detail };
}
