import { auth } from '@/lib/auth';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import {
  and,
  claimDocuments,
  claims,
  createAdminClient,
  eq,
  user,
  withTenantContext,
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
  // 0. Resolve tenant context from trusted host + session and fail closed.
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { kind: 'not_found' };
  let sessionTenantId: string;
  try {
    sessionTenantId = ensureTenantId(session);
  } catch {
    return { kind: 'not_found' };
  }
  const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '';
  const hostTenantId = resolveTenantFromHost(requestHost);
  if (!hostTenantId || hostTenantId !== sessionTenantId) return { kind: 'not_found' };
  const tenantId = hostTenantId;

  // 1-2. Read claim detail under tenant DB context (RLS where configured) + explicit tenant predicates.
  const { claim, userData, agentData, rawDocs } = await withTenantContext(
    {
      tenantId,
      role: session.user?.role ?? undefined,
    },
    async tx => {
      const claim = (await tx.query.claims.findFirst({
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

      if (!claim) {
        return {
          claim: null,
          userData: null,
          agentData: null as { name: string } | null,
          rawDocs: [] as Array<{
            id: string;
            name: string | null;
            fileSize: number | null;
            fileType: string | null;
            createdAt: Date | null;
            filePath: string | null;
            bucket: string | null;
          }>,
        };
      }

      const [userData] = await tx
        .select()
        .from(user)
        .where(and(eq(user.id, claim.userId), eq(user.tenantId, tenantId)))
        .limit(1);

      let agentData: { name: string } | null = null;
      if (claim.agentId) {
        const [a] = await tx
          .select({ name: user.name })
          .from(user)
          .where(and(eq(user.id, claim.agentId), eq(user.tenantId, tenantId)))
          .limit(1);
        agentData = a ? { name: a.name } : null;
      }

      const rawDocs = await tx
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
        .where(and(eq(claimDocuments.claimId, claimId), eq(claimDocuments.tenantId, tenantId)));

      return { claim, userData: userData ?? null, agentData, rawDocs };
    }
  );

  if (!claim) return { kind: 'not_found' };

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
