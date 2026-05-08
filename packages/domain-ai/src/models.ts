import type {
  AiModel,
  AiModelProfile,
  AiReasoningEffort,
  AiReasoningLevel,
  AiResponsesModelConfig,
  AiResponsesWorkflowConfig,
  AiWorkflow,
} from './types';
import { CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION } from './schemas/claim-intake-extract';
import { CLAIM_SUMMARY_SCHEMA_VERSION } from './schemas/claim-summary';
import { LEGAL_DOC_EXTRACT_SCHEMA_VERSION } from './schemas/legal-doc-extract';
import { POLICY_EXTRACT_SCHEMA_VERSION } from './schemas/policy-extract';

export const AI_MODEL_PROFILES = {
  'gpt-5.5': {
    model: 'gpt-5.5',
    tier: 'advanced',
    defaultFor: ['policy_extract', 'claim_intake_extract', 'legal_doc_extract', 'claim_summary'],
    useCase: 'Production extraction, reviewed document reasoning, and operational summaries.',
    reasoningLevel: 'deep',
    textVerbosity: 'low',
    maxOutputTokens: 4_000,
  },
  'gpt-5-mini': {
    model: 'gpt-5-mini',
    tier: 'standard',
    defaultFor: [],
    useCase: 'Optional low-cost fallback for stable extraction and operational summaries.',
    reasoningLevel: 'balanced',
    textVerbosity: 'low',
    maxOutputTokens: 2_000,
  },
  'gpt-5-nano': {
    model: 'gpt-5-nano',
    tier: 'routing',
    defaultFor: [],
    useCase: 'Routing, classification, and cheap control-plane decisions.',
    reasoningLevel: 'light',
    textVerbosity: 'low',
    maxOutputTokens: 512,
  },
  'gpt-5.4-pro': {
    model: 'gpt-5.4-pro',
    tier: 'escalation',
    defaultFor: [],
    useCase: 'Manual escalation paths only, never the default.',
    reasoningLevel: 'deep',
    textVerbosity: 'medium',
    maxOutputTokens: 8_000,
  },
} as const satisfies Record<AiModel, AiModelProfile>;

export const DEFAULT_MODEL_BY_WORKFLOW = {
  policy_extract: 'gpt-5.5',
  claim_intake_extract: 'gpt-5.5',
  legal_doc_extract: 'gpt-5.5',
  claim_summary: 'gpt-5.5',
} as const satisfies Record<AiWorkflow, AiModel>;

export const RESPONSES_CONFIG_BY_WORKFLOW = {
  policy_extract: {
    reasoningLevel: 'deep',
    textVerbosity: 'low',
    maxOutputTokens: 4_000,
  },
  claim_intake_extract: {
    reasoningLevel: 'balanced',
    textVerbosity: 'low',
    maxOutputTokens: 2_000,
  },
  legal_doc_extract: {
    reasoningLevel: 'deep',
    textVerbosity: 'low',
    maxOutputTokens: 4_000,
  },
  claim_summary: {
    reasoningLevel: 'balanced',
    textVerbosity: 'low',
    maxOutputTokens: 2_000,
  },
} as const satisfies Record<
  AiWorkflow,
  Pick<AiModelProfile, 'reasoningLevel' | 'textVerbosity' | 'maxOutputTokens'>
>;

export const DEFAULT_PROMPT_VERSION_BY_WORKFLOW = {
  policy_extract: POLICY_EXTRACT_SCHEMA_VERSION,
  claim_intake_extract: CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION,
  legal_doc_extract: LEGAL_DOC_EXTRACT_SCHEMA_VERSION,
  claim_summary: CLAIM_SUMMARY_SCHEMA_VERSION,
} as const satisfies Record<AiWorkflow, string>;

export function getAiModelProfile(model: AiModel): AiModelProfile {
  return AI_MODEL_PROFILES[model];
}

export function getDefaultModelForWorkflow(workflow: AiWorkflow): AiModel {
  return DEFAULT_MODEL_BY_WORKFLOW[workflow];
}

export function getDefaultPromptVersionForWorkflow(workflow: AiWorkflow): string {
  return DEFAULT_PROMPT_VERSION_BY_WORKFLOW[workflow];
}

export function getReasoningEffortForLevel(level: AiReasoningLevel): AiReasoningEffort {
  if (level === 'light') return 'low';
  if (level === 'balanced') return 'medium';
  return 'high';
}

export function getResponsesModelConfig(model: AiModel): AiResponsesModelConfig {
  const profile = getAiModelProfile(model);

  return {
    model: profile.model,
    reasoning: {
      effort: getReasoningEffortForLevel(profile.reasoningLevel),
    },
    text: {
      verbosity: profile.textVerbosity,
    },
    maxOutputTokens: profile.maxOutputTokens,
  };
}

export function getPromptCacheKeyForWorkflow(workflow: AiWorkflow): string {
  const model = getDefaultModelForWorkflow(workflow);
  const promptVersion = getDefaultPromptVersionForWorkflow(workflow);

  return `interdomestik:${workflow}:${model}:${promptVersion}`;
}

export function getResponsesWorkflowConfig(workflow: AiWorkflow): AiResponsesWorkflowConfig {
  const model = getDefaultModelForWorkflow(workflow);
  const workflowConfig = RESPONSES_CONFIG_BY_WORKFLOW[workflow];

  return {
    workflow,
    model,
    promptVersion: getDefaultPromptVersionForWorkflow(workflow),
    promptCacheKey: getPromptCacheKeyForWorkflow(workflow),
    reasoning: {
      effort: getReasoningEffortForLevel(workflowConfig.reasoningLevel),
    },
    text: {
      verbosity: workflowConfig.textVerbosity,
    },
    maxOutputTokens: workflowConfig.maxOutputTokens,
  };
}
