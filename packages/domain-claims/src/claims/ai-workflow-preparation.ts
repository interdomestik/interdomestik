import { createHash } from 'node:crypto';

import { getResponsesWorkflowConfig } from '@interdomestik/domain-ai/models';
import { nanoid } from 'nanoid';

import {
  buildClaimDocumentAiCallContext,
  type ClaimDocumentAiCallContext,
} from './claim-ai-context';
import { resolveClaimDocumentAiExtractionConsent } from './claim-document-ai-consent';
import type {
  ClaimAiClaimSnapshot,
  ClaimAiDocumentCategory,
  ClaimAiWorkflow,
  ClaimAiWorkflowQueueInput,
} from './ai-workflow-types';

export type PreparedQueuedClaimAiRun = {
  runId: string;
  workflow: ClaimAiWorkflow;
  claimId: string;
  documentId: string;
  category: ClaimAiDocumentCategory;
  model: string;
  promptVersion: string;
  promptCacheKey: string;
  file: ClaimAiWorkflowQueueInput['files'][number];
  inputHash: string;
  aiCallContext: ClaimDocumentAiCallContext;
};

function normalizeCategory(category: string | null | undefined): ClaimAiDocumentCategory {
  return category === 'legal' ? 'legal' : 'evidence';
}

function resolveWorkflow(category: ClaimAiDocumentCategory): ClaimAiWorkflow {
  return category === 'legal' ? 'legal_doc_extract' : 'claim_intake_extract';
}

function buildInputHash(args: {
  workflow: ClaimAiWorkflow;
  claimId: string;
  documentId: string;
  path: string;
  category: ClaimAiDocumentCategory;
  claimSnapshot?: ClaimAiClaimSnapshot | null;
}): string {
  return createHash('sha256').update(JSON.stringify(args)).digest('hex');
}

export async function prepareClaimDocumentAiRun(params: {
  args: ClaimAiWorkflowQueueInput;
  file: ClaimAiWorkflowQueueInput['files'][number];
}): Promise<PreparedQueuedClaimAiRun | null> {
  const { args, file } = params;
  const category = normalizeCategory(file.category);
  const workflow = resolveWorkflow(category);
  const documentId = file.documentId ?? nanoid();
  const consent = await resolveClaimDocumentAiExtractionConsent({
    tx: args.tx,
    tenantId: args.tenantId,
    subjectId: args.userId,
    claimId: args.claimId,
    documentId,
  });

  if (consent.kind !== 'granted') return null;

  const runId = nanoid();
  const config = getResponsesWorkflowConfig(workflow);

  return {
    runId,
    workflow,
    claimId: args.claimId,
    documentId,
    category,
    model: config.model,
    promptVersion: config.promptVersion,
    promptCacheKey: config.promptCacheKey,
    file,
    inputHash: buildInputHash({
      workflow,
      claimId: args.claimId,
      documentId,
      path: file.path,
      category,
      claimSnapshot: args.claimSnapshot,
    }),
    aiCallContext: buildClaimDocumentAiCallContext({
      claimId: args.claimId,
      documentId,
      grant: consent.grant,
      tenantId: args.tenantId,
      userId: args.userId,
      workflow,
    }),
  };
}
