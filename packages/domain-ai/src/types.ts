export const AI_WORKFLOWS = [
  'policy_extract',
  'claim_intake_extract',
  'legal_doc_extract',
  'claim_summary',
] as const;

export type AiWorkflow = (typeof AI_WORKFLOWS)[number];

export const AI_MODELS = ['gpt-5.5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.4-pro'] as const;

export type AiModel = (typeof AI_MODELS)[number];

export type AiModelTier = 'routing' | 'standard' | 'advanced' | 'escalation';

export type AiReasoningLevel = 'light' | 'balanced' | 'deep';
export type AiReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type AiTextVerbosity = 'low' | 'medium' | 'high';
export type AiResourceProfile = 'cheap' | 'standard' | 'default' | 'escalation';
export type AiRoutingInputCompleteness = 'missing' | 'partial' | 'complete';
export type AiRiskLevel = 'low' | 'normal' | 'high';

export type AiRoutingFallbackReason =
  | 'control_plane_only'
  | 'default_compatibility'
  | 'high_risk'
  | 'incomplete_input'
  | 'legal_or_claim_risk'
  | 'low_confidence'
  | 'safe_standard_workload'
  | 'schema_critique_failed'
  | 'sensitive_input'
  | 'sparse_document'
  | 'unknown_workflow'
  | 'warning_threshold';

export interface AiModelProfile {
  model: AiModel;
  tier: AiModelTier;
  defaultFor: readonly AiWorkflow[];
  useCase: string;
  reasoningLevel: AiReasoningLevel;
  textVerbosity: AiTextVerbosity;
  maxOutputTokens: number;
}

export interface AiResponsesModelConfig {
  model: AiModel;
  reasoning: {
    effort: AiReasoningEffort;
  };
  text: {
    verbosity: AiTextVerbosity;
  };
  maxOutputTokens: number;
}

export interface AiResponsesWorkflowConfig extends AiResponsesModelConfig {
  workflow: AiWorkflow;
  promptVersion: string;
  promptCacheKey: string;
}

export interface AiModelRoutingInput {
  workflow?: AiWorkflow | (string & {}) | null;
  mimeType?: string | null;
  parsedTextLength?: number | null;
  extractionTargetCount?: number | null;
  schemaVersion?: string | null;
  claimCategory?: string | null;
  legalDocumentType?: string | null;
  jurisdictionConfidence?: number | null;
  riskLevel?: AiRiskLevel | null;
  priorWarningCount?: number | null;
  priorConfidence?: number | null;
  confidenceBeforeCritique?: number | null;
  confidenceAfterCritique?: number | null;
  hasSimilarHumanReviewCorrection?: boolean | null;
  schemaCritiqueFailed?: boolean | null;
  sensitiveInput?: boolean | null;
  controlPlaneOnly?: boolean | null;
  approvedEscalation?: boolean | null;
}

export interface AiModelRoute {
  workflow: AiWorkflow | null;
  selectedProfile: AiResourceProfile;
  selectedModel: AiModel;
  fallbackReason: AiRoutingFallbackReason;
  complexityScore: number;
  riskLevel: AiRiskLevel;
  confidenceBeforeCritique: number | null;
  confidenceAfterCritique: number | null;
  escalated: boolean;
  routingInputCompleteness: AiRoutingInputCompleteness;
}
