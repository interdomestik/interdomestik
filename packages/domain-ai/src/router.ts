import { AI_WORKFLOWS, type AiModel, type AiModelRoute, type AiModelRoutingInput } from './types';
import type { AiRoutingFallbackReason, AiWorkflow } from './types';

const DEFAULT_MODEL = 'gpt-5.5' satisfies AiModel;
const STANDARD_MODEL = 'gpt-5-mini' satisfies AiModel;
const CHEAP_MODEL = 'gpt-5-nano' satisfies AiModel;
const ESCALATION_MODEL = 'gpt-5.4-pro' satisfies AiModel;
const HIGH_RISK_CLAIM_CATEGORIES = new Set(['legal', 'medical', 'liability']);
const HIGH_RISK_LEGAL_TYPES = new Set(['court_filing', 'demand_letter', 'regulatory_notice']);

function isWorkflow(value: AiModelRoutingInput['workflow']): value is AiWorkflow {
  return typeof value === 'string' && AI_WORKFLOWS.includes(value as AiWorkflow);
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
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
    confidenceBeforeCritique: normalizeNumber(
      input.confidenceBeforeCritique ?? input.priorConfidence
    ),
    confidenceAfterCritique: normalizeNumber(input.confidenceAfterCritique),
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
  const selectedProfile =
    model === CHEAP_MODEL ? 'cheap' : model === STANDARD_MODEL ? 'standard' : 'escalation';

  return {
    ...routeDefault(input, reason, score, 'complete'),
    selectedProfile,
    selectedModel: model,
    escalated: model === ESCALATION_MODEL,
  };
}

function getCompleteness(input: AiModelRoutingInput): AiModelRoute['routingInputCompleteness'] {
  if (!isWorkflow(input.workflow)) return input.workflow ? 'partial' : 'missing';
  const required = [input.mimeType, input.schemaVersion, input.riskLevel];
  if (required.some(value => value === null || value === undefined || value === ''))
    return 'partial';
  return normalizeNumber(input.parsedTextLength) === null ? 'partial' : 'complete';
}

function getComplexityScore(input: AiModelRoutingInput) {
  const textLength = normalizeNumber(input.parsedTextLength) ?? 0;
  const targets = normalizeNumber(input.extractionTargetCount) ?? 0;
  const warnings = normalizeNumber(input.priorWarningCount) ?? 0;
  const confidence = normalizeNumber(input.confidenceAfterCritique ?? input.priorConfidence);
  const riskWeight = input.riskLevel === 'high' ? 35 : input.riskLevel === 'normal' ? 15 : 0;
  const lengthWeight =
    textLength > 20_000 ? 25 : textLength > 8_000 ? 15 : textLength < 500 ? 20 : 5;
  const targetWeight = targets > 12 ? 20 : targets > 6 ? 10 : 0;
  const confidenceWeight = confidence !== null && confidence < 0.65 ? 25 : 0;

  return Math.min(100, riskWeight + lengthWeight + targetWeight + warnings * 8 + confidenceWeight);
}

function getRiskReason(input: AiModelRoutingInput): AiRoutingFallbackReason | null {
  const category = input.claimCategory?.toLowerCase() ?? '';
  const legalType = input.legalDocumentType?.toLowerCase() ?? '';
  const confidence = normalizeNumber(input.confidenceAfterCritique ?? input.priorConfidence);
  const jurisdictionConfidence = normalizeNumber(input.jurisdictionConfidence);

  if (input.sensitiveInput) return 'sensitive_input';
  if (input.schemaCritiqueFailed) return 'schema_critique_failed';
  if (input.riskLevel === 'high') return 'high_risk';
  if (input.workflow === 'legal_doc_extract' && HIGH_RISK_LEGAL_TYPES.has(legalType)) {
    return 'legal_or_claim_risk';
  }
  if (input.workflow === 'claim_intake_extract' && HIGH_RISK_CLAIM_CATEGORIES.has(category)) {
    return 'legal_or_claim_risk';
  }
  if ((normalizeNumber(input.priorWarningCount) ?? 0) >= 3) return 'warning_threshold';
  if (
    (confidence !== null && confidence < 0.55) ||
    (jurisdictionConfidence !== null && jurisdictionConfidence < 0.6)
  )
    return 'low_confidence';
  if ((normalizeNumber(input.parsedTextLength) ?? 0) < 500) return 'sparse_document';
  return null;
}

function shouldUseStandard(input: AiModelRoutingInput) {
  const confidence = normalizeNumber(input.confidenceAfterCritique ?? input.priorConfidence) ?? 1;
  const targetCount = normalizeNumber(input.extractionTargetCount) ?? 0;
  return (
    input.riskLevel === 'low' &&
    ['claim_summary', 'claim_intake_extract'].includes(String(input.workflow)) &&
    (normalizeNumber(input.parsedTextLength) ?? 0) >= 1_000 &&
    targetCount <= 6 &&
    confidence >= 0.8 &&
    (normalizeNumber(input.priorWarningCount) ?? 0) <= 1
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
