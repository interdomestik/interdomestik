import type { AiModel, AiModelProfile, AiWorkflow } from './types';

export const AI_MODEL_PROFILES = {
  'gpt-5.5': {
    model: 'gpt-5.5',
    tier: 'advanced',
    defaultFor: ['policy_extract', 'legal_doc_extract'],
    useCase: 'Ambiguous extraction and reviewed document reasoning.',
    reasoningLevel: 'deep',
    maxOutputTokens: 4_000,
  },
  'gpt-5-mini': {
    model: 'gpt-5-mini',
    tier: 'standard',
    defaultFor: ['claim_intake_extract', 'claim_summary'],
    useCase: 'Stable extraction and operational summaries.',
    reasoningLevel: 'balanced',
    maxOutputTokens: 2_000,
  },
  'gpt-5-nano': {
    model: 'gpt-5-nano',
    tier: 'routing',
    defaultFor: [],
    useCase: 'Routing, classification, and cheap control-plane decisions.',
    reasoningLevel: 'light',
    maxOutputTokens: 512,
  },
  'gpt-5.4-pro': {
    model: 'gpt-5.4-pro',
    tier: 'escalation',
    defaultFor: [],
    useCase: 'Manual escalation paths only, never the default.',
    reasoningLevel: 'deep',
    maxOutputTokens: 8_000,
  },
} as const satisfies Record<AiModel, AiModelProfile>;

export const DEFAULT_MODEL_BY_WORKFLOW = {
  policy_extract: 'gpt-5.5',
  claim_intake_extract: 'gpt-5-mini',
  legal_doc_extract: 'gpt-5.5',
  claim_summary: 'gpt-5-mini',
} as const satisfies Record<AiWorkflow, AiModel>;

export function getAiModelProfile(model: AiModel): AiModelProfile {
  return AI_MODEL_PROFILES[model];
}

export function getDefaultModelForWorkflow(workflow: AiWorkflow): AiModel {
  return DEFAULT_MODEL_BY_WORKFLOW[workflow];
}
