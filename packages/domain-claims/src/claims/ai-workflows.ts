import { createHash } from 'node:crypto';

import { aiRuns, documents } from '@interdomestik/database';
import {
  CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION,
  LEGAL_DOC_EXTRACT_SCHEMA_VERSION,
} from '@interdomestik/domain-ai';
import { getDefaultModelForWorkflow } from '@interdomestik/domain-ai/models';
import { nanoid } from 'nanoid';

export type ClaimAiWorkflow = 'claim_intake_extract' | 'legal_doc_extract';

export type ClaimAiDocumentCategory = 'evidence' | 'legal';

export type ClaimAiFileInput = {
  documentId?: string;
  name: string;
  path: string;
  type: string;
  size: number;
  bucket: string;
  category?: string | null;
};

export type ClaimAiClaimSnapshot = {
  title: string;
  description?: string | null;
  category: string;
  companyName: string;
  claimAmount?: string | null;
  currency?: string | null;
  incidentDate?: string | null;
};

export type QueuedClaimAiRun = {
  runId: string;
  workflow: ClaimAiWorkflow;
  claimId: string;
  documentId: string;
};

type InsertableTx = {
  insert: (table: any) => {
    values: (value: Record<string, unknown> | Array<Record<string, unknown>>) => unknown;
  };
};

function normalizeCategory(category: string | null | undefined): ClaimAiDocumentCategory {
  return category === 'legal' ? 'legal' : 'evidence';
}

function resolveWorkflow(category: ClaimAiDocumentCategory): ClaimAiWorkflow {
  return category === 'legal' ? 'legal_doc_extract' : 'claim_intake_extract';
}

function resolvePromptVersion(workflow: ClaimAiWorkflow) {
  return workflow === 'legal_doc_extract'
    ? LEGAL_DOC_EXTRACT_SCHEMA_VERSION
    : CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION;
}

function buildInputHash(args: {
  workflow: ClaimAiWorkflow;
  claimId: string;
  documentId: string;
  path: string;
  category: ClaimAiDocumentCategory;
  claimSnapshot?: ClaimAiClaimSnapshot | null;
}) {
  return createHash('sha256').update(JSON.stringify(args)).digest('hex');
}

export async function queueClaimDocumentAiWorkflows(args: {
  tx: InsertableTx;
  claimId: string;
  tenantId: string;
  userId: string;
  files: ClaimAiFileInput[];
  claimSnapshot?: ClaimAiClaimSnapshot | null;
}): Promise<QueuedClaimAiRun[]> {
  if (args.files.length === 0) {
    return [];
  }

  const now = new Date();
  const queuedRuns = args.files.map(file => {
    const category = normalizeCategory(file.category);
    const workflow = resolveWorkflow(category);
    const documentId = file.documentId ?? nanoid();
    const runId = nanoid();
    const model = getDefaultModelForWorkflow(workflow);

    return {
      runId,
      workflow,
      claimId: args.claimId,
      documentId,
      category,
      model,
      promptVersion: resolvePromptVersion(workflow),
      file,
      inputHash: buildInputHash({
        workflow,
        claimId: args.claimId,
        documentId,
        path: file.path,
        category,
        claimSnapshot: args.claimSnapshot,
      }),
    };
  });

  await args.tx.insert(documents).values(
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

  await args.tx.insert(aiRuns).values(
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
