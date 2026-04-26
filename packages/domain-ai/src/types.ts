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
