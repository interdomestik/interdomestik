import { auth } from '@/lib/auth';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import {
  and,
  claimStageHistory,
  claimDocuments,
  claims,
  createAdminClient,
  desc,
  eq,
  user,
  withTenantContext,
} from '@interdomestik/database';
import { parseDiasporaOriginFromPublicNote } from '@interdomestik/domain-claims';
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
  if (hostTenantId && hostTenantId !== sessionTenantId) return { kind: 'not_found' };
  if (!hostTenantId && !isNeutralDeploymentHost(requestHost)) return { kind: 'not_found' };
  const tenantId = hostTenantId ?? sessionTenantId;

  // 1-2. Read claim detail under tenant DB context (RLS where configured) + explicit tenant predicates.
  const { claim, userData, agentData, rawDocs, diasporaOrigin } = await withTenantContext(
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
          diasporaOrigin: null as ReturnType<typeof parseDiasporaOriginFromPublicNote>,
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

      const [diasporaNote] = await tx
        .select({
          note: claimStageHistory.note,
        })
        .from(claimStageHistory)
        .where(
          and(eq(claimStageHistory.claimId, claimId), eq(claimStageHistory.tenantId, tenantId))
        )
        .orderBy(desc(claimStageHistory.createdAt), desc(claimStageHistory.id))
        .limit(1);

      return {
        claim,
        userData: userData ?? null,
        agentData,
        rawDocs,
        diasporaOrigin: parseDiasporaOriginFromPublicNote(diasporaNote?.note),
      };
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
      diasporaCountry: diasporaOrigin?.country ?? null,
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
