import type { PolicyAnalysis } from '@/lib/ai/policy-analyzer';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { aiRuns, documents } from '@interdomestik/database/schema';
import { and, eq, isNull } from 'drizzle-orm';

const POLICY_EXTRACT_WORKFLOW = 'policy_extract' as const;

export type PolicyExtractionDeps = {
  downloadFile: (filePath: string, tenantId: string) => Promise<Buffer>;
  analyzeImage: (buffer: Buffer) => Promise<PolicyAnalysis>;
  analyzePdf: (buffer: Buffer) => Promise<string>;
  analyzeText: (text: string) => Promise<PolicyAnalysis>;
};

export type ClaimedPolicyRun = {
  runId: string;
  /** In-memory only: the tenant authority this run was claimed under. Never serialized or persisted. */
  authority: TenantAuthority;
  tenantId: string;
  documentId: string;
  policyId: string;
  storagePath: string | null;
  requestJson: Record<string, unknown> | null;
};

export async function claimPolicyExtractionRun(
  runId: string,
  authority: TenantAuthority
): Promise<{ status: 'claimed'; run: ClaimedPolicyRun } | { status: 'skipped'; policyId: string }> {
  const { tenantId } = readTenantAuthority(authority);
  const [queuedRun] = await withTenantAuthority(authority, tx =>
    tx
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
        and(
          eq(documents.id, aiRuns.documentId),
          eq(documents.tenantId, aiRuns.tenantId),
          isNull(documents.deletedAt)
        )
      )
      .where(
        and(
          eq(aiRuns.id, runId),
          eq(aiRuns.tenantId, tenantId),
          eq(aiRuns.workflow, POLICY_EXTRACT_WORKFLOW),
          eq(aiRuns.entityType, 'policy')
        )
      )
  );

  if (!queuedRun?.documentId || !queuedRun.policyId) {
    // Fallback resolves an already-failed deleted policy AI run inside the producer tenant after the
    // active-document join intentionally returns no row.
    const [deletedRun] = await withTenantAuthority(authority, tx =>
      tx
        .select({
          errorCode: aiRuns.errorCode,
          policyId: aiRuns.entityId,
          status: aiRuns.status,
        })
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.id, runId),
            eq(aiRuns.tenantId, tenantId),
            eq(aiRuns.workflow, POLICY_EXTRACT_WORKFLOW),
            eq(aiRuns.entityType, 'policy')
          )
        )
    );
    if (
      deletedRun?.policyId &&
      deletedRun.status === 'failed' &&
      deletedRun.errorCode === 'document_ai_document_deleted'
    ) {
      return { status: 'skipped', policyId: deletedRun.policyId };
    }
    throw new Error(`Queued policy analysis run ${runId} was not found.`);
  }

  if (queuedRun.status !== 'queued') {
    return { status: 'skipped', policyId: queuedRun.policyId };
  }

  const [claimedRun] = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .update(aiRuns)
        .set({ status: 'processing', startedAt: new Date(), errorCode: null, errorMessage: null })
        .where(
          and(eq(aiRuns.id, runId), eq(aiRuns.tenantId, tenantId), eq(aiRuns.status, 'queued'))
        )
        .returning({ id: aiRuns.id })
  );

  if (!claimedRun) return { status: 'skipped', policyId: queuedRun.policyId };

  return {
    status: 'claimed',
    run: {
      runId,
      authority,
      tenantId: queuedRun.tenantId,
      documentId: queuedRun.documentId,
      policyId: queuedRun.policyId,
      storagePath: queuedRun.storagePath,
      requestJson: queuedRun.requestJson,
    },
  };
}
