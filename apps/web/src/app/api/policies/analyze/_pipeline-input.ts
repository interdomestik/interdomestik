import type { PolicyAnalysis } from '@/lib/ai/policy-analyzer';
import { db } from '@/lib/db.server';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns, documents } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

const POLICY_EXTRACT_WORKFLOW = 'policy_extract' as const;

export type PolicyExtractionDeps = {
  downloadFile: (filePath: string, tenantId: string) => Promise<Buffer>;
  analyzeImage: (buffer: Buffer) => Promise<PolicyAnalysis>;
  analyzePdf: (buffer: Buffer) => Promise<string>;
  analyzeText: (text: string) => Promise<PolicyAnalysis>;
};

export type ClaimedPolicyRun = {
  runId: string;
  tenantId: string;
  documentId: string;
  policyId: string;
  storagePath: string | null;
  requestJson: Record<string, unknown> | null;
};

export async function claimPolicyExtractionRun(
  runId: string
): Promise<{ status: 'claimed'; run: ClaimedPolicyRun } | { status: 'skipped'; policyId: string }> {
  // db-access-guard: tenant-scoped -- reason: tenantId comes from validated AI policy queue input or queued run row
  const [queuedRun] = await db
    .select({
      runId: aiRuns.id,
      tenantId: aiRuns.tenantId,
      documentId: aiRuns.documentId,
      policyId: aiRuns.entityId,
      storagePath: documents.storagePath,
      requestJson: aiRuns.requestJson,
      status: aiRuns.status,
    })
    .from(aiRuns)
    .innerJoin(
      documents,
      and(eq(documents.id, aiRuns.documentId), eq(documents.tenantId, aiRuns.tenantId))
    )
    .where(
      and(
        eq(aiRuns.id, runId),
        eq(aiRuns.workflow, POLICY_EXTRACT_WORKFLOW),
        eq(aiRuns.entityType, 'policy')
      )
    );

  if (!queuedRun?.documentId || !queuedRun.policyId) {
    throw new Error(`Queued policy analysis run ${runId} was not found.`);
  }

  if (queuedRun.status !== 'queued') {
    return { status: 'skipped', policyId: queuedRun.policyId };
  }

  const [claimedRun] = await withTenantContext(
    { tenantId: queuedRun.tenantId, role: 'system' },
    async tx =>
      tx
        .update(aiRuns)
        .set({ status: 'processing', startedAt: new Date(), errorCode: null, errorMessage: null })
        .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, 'queued')))
        .returning({ id: aiRuns.id })
  );

  if (!claimedRun) return { status: 'skipped', policyId: queuedRun.policyId };

  return {
    status: 'claimed',
    run: {
      runId,
      tenantId: queuedRun.tenantId,
      documentId: queuedRun.documentId,
      policyId: queuedRun.policyId,
      storagePath: queuedRun.storagePath,
      requestJson: queuedRun.requestJson,
    },
  };
}
