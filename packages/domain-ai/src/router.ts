import {
  AI_WORKFLOWS,
  type AiModel,
  type AiModelRoute,
  type AiModelRoutingInput,
  type AiResourceProfile,
  type AiRoutingFallbackReason,
  type AiWorkflow,
} from './types';

import { normalizeRoutingNumber } from './router-numbers';
import { getComplexityScore } from './router-score';

const DEFAULT_MODEL = 'gpt-5.5' satisfies AiModel;
const STANDARD_MODEL = 'gpt-5-mini' satisfies AiModel;
const CHEAP_MODEL = 'gpt-5-nano' satisfies AiModel;
const ESCALATION_MODEL = 'gpt-5.4-pro' satisfies AiModel;
const HIGH_RISK_CLAIM_CATEGORIES = new Set(['legal', 'medical', 'liability']);
const HIGH_RISK_LEGAL_TYPES = new Set(['court_filing', 'demand_letter', 'regulatory_notice']);
const PROFILE_BY_MODEL: Record<AiModel, AiResourceProfile> = {
  [DEFAULT_MODEL]: 'default',
  [STANDARD_MODEL]: 'standard',
  [CHEAP_MODEL]: 'cheap',
  [ESCALATION_MODEL]: 'escalation',
};

function isWorkflow(value: AiModelRoutingInput['workflow']): value is AiWorkflow {
  return typeof value === 'string' && AI_WORKFLOWS.includes(value as AiWorkflow);
}

function routeDefault(
  input: AiModelRoutingInput,
  reason: AiRoutingFallbackReason,
  score: number,
  completeness: AiModelRoute['routingInputCompleteness']
): AiModelRoute {
  return {
    workflow: isWorkflow(input.workflow) ? input.workflow : null,
    selectedProfile: 'default',
    selectedModel: DEFAULT_MODEL,
    fallbackReason: reason,
    complexityScore: score,
    riskLevel: input.riskLevel ?? 'normal',
    confidenceBeforeCritique: normalizeRoutingNumber(
      input.confidenceBeforeCritique ?? input.priorConfidence
    ),
    confidenceAfterCritique: normalizeRoutingNumber(input.confidenceAfterCritique),
    escalated: false,
    routingInputCompleteness: completeness,
  };
}

function routeWithModel(
  input: AiModelRoutingInput,
  model: AiModel,
  reason: AiRoutingFallbackReason,
  score: number
): AiModelRoute {
  return {
    ...routeDefault(input, reason, score, 'complete'),
    selectedProfile: PROFILE_BY_MODEL[model],
    selectedModel: model,
    escalated: model === ESCALATION_MODEL,
  };
}

function getCompleteness(input: AiModelRoutingInput): AiModelRoute['routingInputCompleteness'] {
  if (!isWorkflow(input.workflow)) return input.workflow ? 'partial' : 'missing';
  const required = [input.mimeType, input.schemaVersion, input.riskLevel];
  if (required.some(value => value === null || value === undefined || value === ''))
    return 'partial';
  return normalizeRoutingNumber(input.parsedTextLength) === null ? 'partial' : 'complete';
}

function getRiskReason(input: AiModelRoutingInput): AiRoutingFallbackReason | null {
  const category = input.claimCategory?.toLowerCase() ?? '';
  const legalType = input.legalDocumentType?.toLowerCase() ?? '';
  const confidence = normalizeRoutingNumber(input.confidenceAfterCritique ?? input.priorConfidence);
  const jurisdictionConfidence = normalizeRoutingNumber(input.jurisdictionConfidence);

  if (input.sensitiveInput) return 'sensitive_input';
  if (input.schemaCritiqueFailed) return 'schema_critique_failed';
  if (input.riskLevel === 'high') return 'high_risk';
  if (input.workflow === 'legal_doc_extract' && HIGH_RISK_LEGAL_TYPES.has(legalType)) {
    return 'legal_or_claim_risk';
  }
  if (input.workflow === 'claim_intake_extract' && HIGH_RISK_CLAIM_CATEGORIES.has(category)) {
    return 'legal_or_claim_risk';
  }
  if ((normalizeRoutingNumber(input.priorWarningCount) ?? 0) >= 3) return 'warning_threshold';
  if (
    (confidence !== null && confidence < 0.55) ||
    (jurisdictionConfidence !== null && jurisdictionConfidence < 0.6)
  )
    return 'low_confidence';
  if ((normalizeRoutingNumber(input.parsedTextLength) ?? 0) < 500) return 'sparse_document';
  return null;
}

function shouldUseStandard(input: AiModelRoutingInput) {
  const confidence =
    normalizeRoutingNumber(input.confidenceAfterCritique ?? input.priorConfidence) ?? 1;
  const targetCount = normalizeRoutingNumber(input.extractionTargetCount) ?? 0;
  return (
    input.riskLevel === 'low' &&
    ['claim_summary', 'claim_intake_extract'].includes(String(input.workflow)) &&
    (normalizeRoutingNumber(input.parsedTextLength) ?? 0) >= 1_000 &&
    targetCount <= 6 &&
    confidence >= 0.8 &&
    (normalizeRoutingNumber(input.priorWarningCount) ?? 0) <= 1
  );
}

export function routeAiModel(input: AiModelRoutingInput = {}): AiModelRoute {
  const completeness = getCompleteness(input);
  const score = getComplexityScore(input);
  if (!isWorkflow(input.workflow))
    return routeDefault(input, 'unknown_workflow', score, completeness);
  if (completeness !== 'complete')
    return routeDefault(input, 'incomplete_input', score, completeness);
  const riskReason = getRiskReason(input);
  if (riskReason) {
    return input.approvedEscalation
      ? routeWithModel(input, ESCALATION_MODEL, riskReason, score)
      : routeDefault(input, riskReason, score, 'complete');
  }
  if (input.controlPlaneOnly && input.riskLevel === 'low') {
    return routeWithModel(input, CHEAP_MODEL, 'control_plane_only', score);
  }
  if (shouldUseStandard(input))
    return routeWithModel(input, STANDARD_MODEL, 'safe_standard_workload', score);
  return routeDefault(input, 'default_compatibility', score, 'complete');
}
