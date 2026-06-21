import { aiRuns, documents } from '@interdomestik/database';

import {
  prepareClaimDocumentAiRun,
  type PreparedQueuedClaimAiRun,
} from './ai-workflow-preparation';
import type { ClaimAiWorkflowQueueInput, QueuedClaimAiRun } from './ai-workflow-types';

type QueueInsertTx = {
  insert: (table: unknown) => { values: (rows: unknown) => unknown };
};

export type {
  ClaimAiClaimSnapshot,
  ClaimAiDocumentCategory,
  ClaimAiFileInput,
  ClaimAiWorkflow,
  QueuedClaimAiRun,
} from './ai-workflow-types';

function canInsertQueueRows(tx: unknown): tx is QueueInsertTx {
  return typeof (tx as { insert?: unknown }).insert === 'function';
}

async function insertQueueRows(tx: unknown, table: unknown, rows: unknown): Promise<void> {
  if (!canInsertQueueRows(tx)) {
    throw new Error('Claim document AI workflow queue requires an insert-capable transaction.');
  }

  await tx.insert(table).values(rows);
}

export async function queueClaimDocumentAiWorkflows(args: {
  tx: ClaimAiWorkflowQueueInput['tx'];
  claimId: ClaimAiWorkflowQueueInput['claimId'];
  tenantId: ClaimAiWorkflowQueueInput['tenantId'];
  userId: ClaimAiWorkflowQueueInput['userId'];
  files: ClaimAiWorkflowQueueInput['files'];
  claimSnapshot?: ClaimAiWorkflowQueueInput['claimSnapshot'];
}): Promise<QueuedClaimAiRun[]> {
  if (args.files.length === 0) {
    return [];
  }

  const queuedRuns: PreparedQueuedClaimAiRun[] = [];
  for (const file of args.files) {
    const queuedRun = await prepareClaimDocumentAiRun({ args, file });
    if (queuedRun) queuedRuns.push(queuedRun);
  }

  if (queuedRuns.length === 0) return [];

  const now = new Date();

  await insertQueueRows(
    args.tx,
    documents,
    queuedRuns.map(queuedRun => ({
      id: queuedRun.documentId,
      tenantId: args.tenantId,
      entityType: 'claim',
      entityId: args.claimId,
      fileName: queuedRun.file.name,
      mimeType: queuedRun.file.type,
      fileSize: queuedRun.file.size,
      storagePath: queuedRun.file.path,
      category: queuedRun.category,
      description:
        queuedRun.workflow === 'legal_doc_extract'
          ? 'Claim legal document queued for AI extraction.'
          : 'Claim evidence queued for AI intake extraction.',
      uploadedBy: args.userId,
      uploadedAt: now,
    }))
  );

  await insertQueueRows(
    args.tx,
    aiRuns,
    queuedRuns.map(queuedRun => ({
      id: queuedRun.runId,
      tenantId: args.tenantId,
      workflow: queuedRun.workflow,
      status: 'queued',
      documentId: queuedRun.documentId,
      entityType: 'claim',
      entityId: args.claimId,
      requestedBy: args.userId,
      model: queuedRun.model,
      modelSnapshot: queuedRun.model,
      promptVersion: queuedRun.promptVersion,
      inputHash: queuedRun.inputHash,
      requestJson: {
        fileName: queuedRun.file.name,
        mimeType: queuedRun.file.type,
        fileSize: queuedRun.file.size,
        storagePath: queuedRun.file.path,
        bucket: queuedRun.file.bucket,
        category: queuedRun.category,
        promptCacheKey: queuedRun.promptCacheKey,
        aiCallContext: queuedRun.aiCallContext,
        claimSnapshot: args.claimSnapshot ?? null,
      },
      reviewStatus: 'pending',
      createdAt: now,
    }))
  );

  return queuedRuns.map(queuedRun => ({
    runId: queuedRun.runId,
    workflow: queuedRun.workflow,
    claimId: queuedRun.claimId,
    documentId: queuedRun.documentId,
  }));
}
