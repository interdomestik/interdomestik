import type { PolicyAnalysis } from '@/lib/ai/policy-analyzer';
import { db } from '@interdomestik/database';
import { documentExtractions, documents, policies } from '@interdomestik/database/schema';
import { desc } from 'drizzle-orm';

type PolicyRow = typeof policies.$inferSelect;

export type PolicyWithDocumentLink = {
  policy: PolicyRow;
  resolvedAnalysis: PolicyAnalysis | null;
  documentDownloadHref: string;
};

type PolicyDocumentLink = {
  id: string;
  entityId: string;
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

export async function getPoliciesWithDocumentLinksCore(args: {
  tenantId: string;
  userId: string;
}): Promise<PolicyWithDocumentLink[]> {
  const { tenantId, userId } = args;
  const userPolicies = await db.query.policies.findMany({
    where: (policiesTable, { and, eq }) =>
      and(eq(policiesTable.userId, userId), eq(policiesTable.tenantId, tenantId)),
    orderBy: [desc(policies.createdAt)],
  });

  if (userPolicies.length === 0) {
    return [];
  }

  const policyIds = userPolicies.map(policy => policy.id);

  const extractions = await db.query.documentExtractions.findMany({
    where: (extractionsTable, { and, eq, inArray: whereInArray }) =>
      and(
        eq(extractionsTable.tenantId, tenantId),
        eq(extractionsTable.entityType, 'policy'),
        whereInArray(extractionsTable.entityId, policyIds)
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

  const policyDocuments = (await db.query.documents.findMany({
    columns: {
      id: true,
      entityId: true,
    },
    where: (documentsTable, { and, eq, inArray: whereInArray, isNull }) =>
      and(
        eq(documentsTable.tenantId, tenantId),
        eq(documentsTable.entityType, 'policy'),
        whereInArray(documentsTable.entityId, policyIds),
        isNull(documentsTable.deletedAt)
      ),
    orderBy: [desc(documents.uploadedAt)],
  })) as PolicyDocumentLink[];

  const latestDocumentByPolicyId = new Map<string, PolicyDocumentLink>();
  for (const document of policyDocuments) {
    if (!latestDocumentByPolicyId.has(document.entityId)) {
      latestDocumentByPolicyId.set(document.entityId, document);
    }
  }

  return userPolicies.map(policy => {
    const resolvedAnalysis =
      latestExtractionByPolicyId.get(policy.id) ?? resolvePolicyAnalysis(policy.analysisJson);
    const document = latestDocumentByPolicyId.get(policy.id);

    return {
      policy,
      resolvedAnalysis,
      documentDownloadHref: document
        ? `/api/documents/${encodeURIComponent(document.id)}/download?disposition=inline`
        : '',
    };
  });
}
