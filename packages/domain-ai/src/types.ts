export const AI_WORKFLOWS = [
  'policy_extract',
  'claim_intake_extract',
  'legal_doc_extract',
  'claim_summary',
] as const;

export type AiWorkflow = (typeof AI_WORKFLOWS)[number];

export const AI_MODELS = ['gpt-5.4', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.4-pro'] as const;

export type AiModel = (typeof AI_MODELS)[number];

export type AiModelTier = 'routing' | 'standard' | 'advanced' | 'escalation';

export type AiReasoningLevel = 'light' | 'balanced' | 'deep';

export interface AiModelProfile {
  model: AiModel;
  tier: AiModelTier;
  defaultFor: readonly AiWorkflow[];
  useCase: string;
  reasoningLevel: AiReasoningLevel;
  maxOutputTokens: number;
}
