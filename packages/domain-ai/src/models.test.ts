import { describe, expect, it } from 'vitest';

import {
  AI_MODEL_PROFILES,
  DEFAULT_MODEL_BY_WORKFLOW,
  DEFAULT_PROMPT_VERSION_BY_WORKFLOW,
  getDefaultModelForWorkflow,
  getDefaultPromptVersionForWorkflow,
  getPromptCacheKeyForWorkflow,
  getReasoningEffortForLevel,
  getResponsesModelConfig,
  getResponsesWorkflowConfig,
} from './models';
import { AI_MODELS, AI_WORKFLOWS } from './types';

const sortStrings = (values: readonly string[]): string[] =>
  [...values].sort((left, right) => left.localeCompare(right));

describe('AI model profiles', () => {
  it('has a default model for every workflow', () => {
    expect(sortStrings(Object.keys(DEFAULT_MODEL_BY_WORKFLOW))).toEqual(sortStrings(AI_WORKFLOWS));
  });

  it('has a prompt version for every workflow', () => {
    expect(sortStrings(Object.keys(DEFAULT_PROMPT_VERSION_BY_WORKFLOW))).toEqual(
      sortStrings(AI_WORKFLOWS)
    );
  });

  it('has a profile for every supported model', () => {
    expect(sortStrings(Object.keys(AI_MODEL_PROFILES))).toEqual(sortStrings(AI_MODELS));
  });

  it('keeps workflow defaults aligned with model profile defaultFor declarations', () => {
    for (const workflow of AI_WORKFLOWS) {
      const model = getDefaultModelForWorkflow(workflow);

      expect(AI_MODEL_PROFILES[model].defaultFor).toContain(workflow);
    }
  });

  it('returns canonical prompt versions for workflow provenance', () => {
    expect(getDefaultPromptVersionForWorkflow('policy_extract')).toBe('policy_extract_v1');
    expect(getDefaultPromptVersionForWorkflow('claim_intake_extract')).toBe(
      'claim_intake_extract_v1'
    );
    expect(getDefaultPromptVersionForWorkflow('legal_doc_extract')).toBe('legal_doc_extract_v1');
    expect(getDefaultPromptVersionForWorkflow('claim_summary')).toBe('claim_summary_v1');
  });
});

describe('Responses model config', () => {
  it('maps profile reasoning levels to Responses API reasoning efforts', () => {
    expect(getReasoningEffortForLevel('light')).toBe('low');
    expect(getReasoningEffortForLevel('balanced')).toBe('medium');
    expect(getReasoningEffortForLevel('deep')).toBe('high');
  });

  it('builds a Responses-ready config from the profile', () => {
    expect(getResponsesModelConfig('gpt-5.5')).toEqual({
      model: 'gpt-5.5',
      reasoning: {
        effort: 'high',
      },
      text: {
        verbosity: 'low',
      },
      maxOutputTokens: 4_000,
    });
  });

  it('builds a Responses-ready workflow config with a stable prompt cache key', () => {
    expect(getPromptCacheKeyForWorkflow('policy_extract')).toBe(
      'interdomestik:policy_extract:gpt-5.5:policy_extract_v1'
    );
    expect(getPromptCacheKeyForWorkflow('claim_intake_extract')).toBe(
      'interdomestik:claim_intake_extract:gpt-5.5:claim_intake_extract_v1'
    );
    expect(getPromptCacheKeyForWorkflow('legal_doc_extract')).toBe(
      'interdomestik:legal_doc_extract:gpt-5.5:legal_doc_extract_v1'
    );
    expect(getPromptCacheKeyForWorkflow('claim_summary')).toBe(
      'interdomestik:claim_summary:gpt-5.5:claim_summary_v1'
    );
    expect(getResponsesWorkflowConfig('policy_extract')).toEqual({
      workflow: 'policy_extract',
      model: 'gpt-5.5',
      promptVersion: 'policy_extract_v1',
      promptCacheKey: 'interdomestik:policy_extract:gpt-5.5:policy_extract_v1',
      reasoning: {
        effort: 'high',
      },
      text: {
        verbosity: 'low',
      },
      maxOutputTokens: 4_000,
    });
    expect(getResponsesWorkflowConfig('claim_intake_extract')).toEqual({
      workflow: 'claim_intake_extract',
      model: 'gpt-5.5',
      promptVersion: 'claim_intake_extract_v1',
      promptCacheKey: 'interdomestik:claim_intake_extract:gpt-5.5:claim_intake_extract_v1',
      reasoning: {
        effort: 'medium',
      },
      text: {
        verbosity: 'low',
      },
      maxOutputTokens: 2_000,
    });
    expect(getResponsesWorkflowConfig('legal_doc_extract')).toEqual({
      workflow: 'legal_doc_extract',
      model: 'gpt-5.5',
      promptVersion: 'legal_doc_extract_v1',
      promptCacheKey: 'interdomestik:legal_doc_extract:gpt-5.5:legal_doc_extract_v1',
      reasoning: {
        effort: 'high',
      },
      text: {
        verbosity: 'low',
      },
      maxOutputTokens: 4_000,
    });
    expect(getResponsesWorkflowConfig('claim_summary')).toEqual({
      workflow: 'claim_summary',
      model: 'gpt-5.5',
      promptVersion: 'claim_summary_v1',
      promptCacheKey: 'interdomestik:claim_summary:gpt-5.5:claim_summary_v1',
      reasoning: {
        effort: 'medium',
      },
      text: {
        verbosity: 'low',
      },
      maxOutputTokens: 2_000,
    });
  });
});
