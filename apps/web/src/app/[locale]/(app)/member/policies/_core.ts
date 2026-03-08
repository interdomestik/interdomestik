import type { PolicyAnalysis } from '@/lib/ai/policy-analyzer';
import { createAdminClient, db, inArray } from '@interdomestik/database';
import { documentExtractions, policies } from '@interdomestik/database/schema';
import { desc } from 'drizzle-orm';

type PolicyRow = typeof policies.$inferSelect;

export type PolicyWithSignedUrl = {
  policy: PolicyRow;
  resolvedAnalysis: PolicyAnalysis | null;
  fileHref: string;
};

function resolvePolicyAnalysis(
  value: Record<string, unknown> | null | undefined
): PolicyAnalysis | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  ) {
    return null;
  }

  return value as PolicyAnalysis;
}

export async function getPoliciesWithSignedUrlsCore(args: {
  tenantId: string;
  userId: string;
}): Promise<PolicyWithSignedUrl[]> {
  const { tenantId, userId } = args;
  const userPolicies = await db.query.policies.findMany({
    where: (policiesTable, { and, eq }) =>
      and(eq(policiesTable.userId, userId), eq(policiesTable.tenantId, tenantId)),
    orderBy: [desc(policies.createdAt)],
  });

  if (userPolicies.length === 0) {
    return [];
  }

  const extractions = await db.query.documentExtractions.findMany({
    where: (extractionsTable, { and, eq, inArray: whereInArray }) =>
      and(
        eq(extractionsTable.tenantId, tenantId),
        eq(extractionsTable.entityType, 'policy'),
        whereInArray(
          extractionsTable.entityId,
          userPolicies.map(policy => policy.id)
        )
      ),
    orderBy: [desc(documentExtractions.createdAt)],
  });

  const latestExtractionByPolicyId = new Map<string, PolicyAnalysis>();
  for (const extraction of extractions) {
    if (latestExtractionByPolicyId.has(extraction.entityId)) {
      continue;
    }

    const resolved = resolvePolicyAnalysis(extraction.extractedJson);
    if (resolved) {
      latestExtractionByPolicyId.set(extraction.entityId, resolved);
    }
  }

  const adminClient = createAdminClient();
  const policiesBucket = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';

  return Promise.all(
    userPolicies.map(async policy => {
      const resolvedAnalysis =
        latestExtractionByPolicyId.get(policy.id) ?? resolvePolicyAnalysis(policy.analysisJson);
      const storedUrl = policy.fileUrl || '';
      if (!storedUrl) {
        return { policy, resolvedAnalysis, fileHref: '' };
      }

      if (storedUrl.startsWith('http://') || storedUrl.startsWith('https://')) {
        return { policy, resolvedAnalysis, fileHref: storedUrl };
      }

      const { data, error } = await adminClient.storage
        .from(policiesBucket)
        .createSignedUrl(storedUrl, 300);

      return { policy, resolvedAnalysis, fileHref: error ? '' : (data?.signedUrl ?? '') };
    })
  );
}
