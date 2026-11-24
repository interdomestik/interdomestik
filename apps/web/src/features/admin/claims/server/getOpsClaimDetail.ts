import 'server-only';

import { isAdmin } from '@/lib/roles';
import { authorizeSessionTenant, type AuthorizedSession } from '@/lib/tenant-authority.server';
import { isExactIdaFrontDoorHost } from '@/lib/tenant/tenant-front-door';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import {
  canViewAdminClaims,
  getVisibleOpsClaim,
} from '@interdomestik/domain-claims/admin-claims/visible-ops-claim';
import {
  listVisibleClaimDocuments,
  OPS_CLAIM_DOCUMENT_PAGE_SIZE,
} from '@interdomestik/domain-documents/claim-documents';
import { searchAssignableStaff } from '@interdomestik/domain-users/admin/search-assignable-staff';
import { MissingTenantError } from '@interdomestik/shared-auth/errors';
import { headers } from 'next/headers';
import { mapClaimToOperationalRow, type RawClaimRow } from '../mappers/mapClaimToOperationalRow';
import type { ClaimOpsDetail } from '../types';
import { readOpsClaimHomeTenantDetails } from './getOpsClaimDetailHomeReads';
import { signOpsDocuments } from './sign-ops-documents';

export type OpsClaimDetailSearch = {
  documentsAfter?: string;
  staffAfter?: string;
  staffSearch?: string;
};

export type OpsClaimDetailResult =
  | { kind: 'not_found' }
  | {
      kind: 'ok';
      data: ClaimOpsDetail;
      authorized: AuthorizedSession;
      documentsNextCursor: string | null;
      staffPage: Awaited<ReturnType<typeof searchAssignableStaff>> | null;
    };

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
  { documentsAfter, staffAfter, staffSearch }: OpsClaimDetailSearch = {}
): Promise<OpsClaimDetailResult> {
  const requestHeaders = await headers();
  let authorized: AuthorizedSession | null;
  try {
    authorized = await authorizeSessionTenant(requestHeaders);
  } catch (error) {
    if (error instanceof MissingTenantError) return { kind: 'not_found' };
    throw error;
  }
  if (!authorized) return { kind: 'not_found' };
  const { authority, session } = authorized;
  const { accessTenantId, principal } = readTenantAuthority(authority);
  if (
    !principal ||
    principal.userId !== session.user.id ||
    principal.role !== (session.user.role ?? null) ||
    principal.branchId !== (session.user.branchId ?? null) ||
    !canViewAdminClaims(principal) ||
    !resolveRequestTenant(requestHeaders, accessTenantId)
  ) {
    return { kind: 'not_found' };
  }

  const result = await withTenantAuthority(authority, async tx => {
    const visibleClaim = await getVisibleOpsClaim(tx, { authority, claimId });
    if (!visibleClaim) return null;

    const documents = await listVisibleClaimDocuments(tx, {
      visibleClaim,
      afterId: documentsAfter,
      limit: OPS_CLAIM_DOCUMENT_PAGE_SIZE,
    });
    const staffPage = isAdmin(session.user.role)
      ? await searchAssignableStaff(tx, { authority, search: staffSearch, afterId: staffAfter })
      : null;
    return { claim: visibleClaim.claim, documents, staffPage };
  });

  if (!result) return { kind: 'not_found' };
  const { claim, documents, staffPage } = result;
  const { agentData, branchData, diasporaOrigin, staffData, userData } =
    await readOpsClaimHomeTenantDetails({ authority, claim });

  const docs = documents.kind === 'page' ? await signOpsDocuments(documents.items) : [];
  const documentSummary =
    documents.kind === 'summary' ? { count: documents.count, evidenceComplete: null } : undefined;

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

  return {
    kind: 'ok',
    data: detail,
    authorized,
    documentsNextCursor: documents.kind === 'page' ? documents.nextCursor : null,
    staffPage,
  };
}
