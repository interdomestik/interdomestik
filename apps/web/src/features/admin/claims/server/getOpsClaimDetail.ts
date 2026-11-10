import { deniesClaimDocumentContent } from '@/app/api/documents/branch-manager-document-boundary';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { createTenantSignedDownloadUrl } from '@/lib/storage/service-role';
import { isExactIdaFrontDoorHost } from '@/lib/tenant/tenant-front-door';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { and, claimDocuments, claims, eq } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { ClaimStatus } from '@interdomestik/database/constants';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ensureAccessTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { count } from 'drizzle-orm';
import { matchesAccessTenant as mat } from '@/lib/db/access-tenant-predicate';
import { mapClaimToOperationalRow, RawClaimRow } from '../mappers/mapClaimToOperationalRow';
import { canViewAdminClaims, resolveClaimsVisibility } from './claimVisibility';
import { ClaimOpsDetail } from '../types';
import { readOpsClaimHomeTenantDetails } from './getOpsClaimDetailHomeReads';
export type OpsClaimDetailResult = { kind: 'not_found' } | { kind: 'ok'; data: ClaimOpsDetail };
const NEUTRAL_DEPLOYMENT_HOSTS = new Set(['interdomestik-web.vercel.app']);

function normalizeRequestHost(host: string): string {
  const raw = host.split(',')[0]?.trim() ?? '';
  return raw.replace(/:\d+$/, '').toLowerCase().replace(/\.$/, '');
}

function configuredNeutralHosts(): Set<string> {
  const hosts = new Set(NEUTRAL_DEPLOYMENT_HOSTS);

  for (const candidate of [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!candidate) continue;
    try {
      hosts.add(new URL(candidate).host.toLowerCase().replace(/\.$/, ''));
    } catch {
      // Ignore malformed env and keep the fallback allowlist deterministic.
    }
  }

  if (process.env.VERCEL_URL) {
    hosts.add(process.env.VERCEL_URL.toLowerCase().replace(/\.$/, ''));
  }

  return hosts;
}

function isNeutralDeploymentHost(host: string): boolean {
  return configuredNeutralHosts().has(normalizeRequestHost(host));
}

/**
 * The tenant this request reads: a tenant host must match the session's access tenant, and a host
 * without a tenant must be a neutral deployment or the exact front door. Null fails closed.
 */
function resolveRequestTenant(
  requestHeaders: Headers,
  sessionAccessTenantId: string
): string | null {
  const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '';
  const hostTenantId = resolveTenantFromHost(requestHost);
  if (hostTenantId && hostTenantId !== sessionAccessTenantId) return null;
  if (
    !hostTenantId &&
    !isNeutralDeploymentHost(requestHost) &&
    !isExactIdaFrontDoorHost(requestHost)
  ) {
    return null;
  }
  return hostTenantId ?? sessionAccessTenantId;
}

export async function getOpsClaimDetail(
  claimId: string,
  authority: TenantAuthority
): Promise<OpsClaimDetailResult> {
  // 0. Resolve tenant context from trusted host + session and fail closed.
  const requestHeaders = await headers();
  const authorized = await authorizeSessionTenant(requestHeaders).catch(() => null);
  if (!authorized) return { kind: 'not_found' };
  const { session } = authorized;
  let sessionAccessTenantId: string;
  try {
    sessionAccessTenantId = ensureAccessTenantId(session);
  } catch {
    return { kind: 'not_found' };
  }
  const visibility = await resolveClaimsVisibility(session);
  if (!visibility || !canViewAdminClaims(visibility)) return { kind: 'not_found' };
  if (visibility.role === 'branch_manager' && !visibility.branchId) return { kind: 'not_found' };
  const tenantId = resolveRequestTenant(requestHeaders, sessionAccessTenantId);
  if (tenantId === null) return { kind: 'not_found' };
  // The read runs under the caller's authority, which must be this session user's for this tenant.
  const granted = readTenantAuthority(authority);
  if (granted.tenantId !== tenantId || granted.principal?.userId !== session.user?.id) {
    return { kind: 'not_found' };
  }

  const { claim, rawDocs, documentSummary } = await withTenantAuthority(authority, async tx => {
    const claim = await tx.query.claims.findFirst({
      where: and(
        eq(claims.id, claimId),
        mat(claims, tenantId),
        visibility.role === 'branch_manager' && visibility.branchId
          ? eq(claims.branchId, visibility.branchId)
          : undefined
      ),
    });

    if (!claim) {
      return {
        claim: null,
        documentSummary: undefined,
        userData: null,
        agentData: null as { name: string } | null,
        rawDocs: [] as Array<{
          id: string;
          tenantId: string;
          name: string | null;
          fileSize: number | null;
          fileType: string | null;
          createdAt: Date | null;
          filePath: string | null;
          bucket: string | null;
        }>,
      };
    }

    if (deniesClaimDocumentContent(session.user.role)) {
      const [summary] = await tx
        .select({ count: count() })
        .from(claimDocuments)
        .where(and(eq(claimDocuments.claimId, claimId), mat(claimDocuments, tenantId)));
      return {
        claim,
        rawDocs: [],
        // No authoritative completeness signal is stored on this read surface.
        documentSummary: { count: summary?.count ?? 0, evidenceComplete: null },
      };
    }

    const rawDocs = await tx
      .select({
        id: claimDocuments.id,
        tenantId: claimDocuments.tenantId,
        name: claimDocuments.name,
        fileSize: claimDocuments.fileSize,
        fileType: claimDocuments.fileType,
        createdAt: claimDocuments.createdAt,
        filePath: claimDocuments.filePath,
        bucket: claimDocuments.bucket,
      })
      .from(claimDocuments)
      .where(and(eq(claimDocuments.claimId, claimId), mat(claimDocuments, tenantId)));

    return {
      claim,
      rawDocs,
      documentSummary: undefined,
    };
  });

  if (!claim) return { kind: 'not_found' };
  const { agentData, branchData, diasporaOrigin, staffData, userData } =
    await readOpsClaimHomeTenantDetails({
      authority,
      claim,
      claimId,
    });

  const docs = await Promise.all(
    rawDocs.map(async doc => {
      const { data } = await createTenantSignedDownloadUrl({
        bucket: doc.bucket,
        context: 'ops claim document signed URL',
        family: 'claims',
        path: doc.filePath,
        tenantId: doc.tenantId,
      });
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

  const rawRow: RawClaimRow = {
    claim: {
      id: claim.id,
      title: claim.title,
      status: claimStatusFromLifecycleFields(claim) as ClaimStatus,
      caseLifecycleState: claim.caseLifecycleState,
      recoveryLifecycleState: claim.recoveryLifecycleState,
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
      diasporaCountry: diasporaOrigin?.country ?? null,
    },
    claimant: userData
      ? {
          name: userData.name,
          email: userData.email,
          memberNumber: userData.memberNumber,
        }
      : null,
    staff: staffData
      ? {
          name: staffData.name,
          email: staffData.email,
        }
      : null,
    branch: branchData
      ? {
          id: branchData.id,
          code: branchData.code,
          name: branchData.name,
        }
      : null,
    agent: agentData
      ? {
          name: agentData.name,
        }
      : null,
  };

  const opsRow = mapClaimToOperationalRow(rawRow);

  const detail: ClaimOpsDetail = {
    ...opsRow,
    description: claim.description,
    docs,
    ...(documentSummary ? { documentSummary } : {}),
    companyName: claim.companyName,
    claimAmount: claim.claimAmount ? String(claim.claimAmount) : null,
    currency: claim.currency,
    createdAt: claim.createdAt,
  };

  return { kind: 'ok', data: detail };
}
