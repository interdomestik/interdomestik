import type { AICallContext, AICallContextFields } from './ai';
import type { ConsentEvent, DocumentProcessingPolicy, ProcessingPurpose } from './types';

export type AICallContextMintDecision =
  | { kind: 'valid'; context: AICallContext; reasons: readonly [] }
  | { kind: 'invalid'; reasons: readonly string[] }
  | { kind: 'missing_consent'; reasons: readonly string[] };

export interface AICallContextConsentEvidence {
  consentEvents: readonly ConsentEvent[];
  documentPolicy?: DocumentProcessingPolicy;
  modelBoundary?: string;
  promptOrSchemaVersion?: string;
  requestedPurpose?: ProcessingPurpose;
  noTraining?: boolean;
  zeroRetention?: boolean;
}

export type AICallContextMintInput = AICallContextFields & {
  consentEvidence?: AICallContextConsentEvidence;
};
