import type { AiModelRoutingInput, AiRiskLevel } from './types';

import { normalizeRoutingNumber } from './router-numbers';

const RISK_WEIGHT_BY_LEVEL: Record<AiRiskLevel, number> = { low: 0, normal: 15, high: 35 };

function getLengthWeight(textLength: number) {
  if (textLength > 20_000) return 25;
  if (textLength > 8_000) return 15;
  if (textLength < 500) return 20;
  return 5;
}

function getTargetWeight(targets: number) {
  if (targets > 12) return 20;
  if (targets > 6) return 10;
  return 0;
}

export function getComplexityScore(input: AiModelRoutingInput) {
  const textLength = normalizeRoutingNumber(input.parsedTextLength) ?? 0;
  const targets = normalizeRoutingNumber(input.extractionTargetCount) ?? 0;
  const warnings = normalizeRoutingNumber(input.priorWarningCount) ?? 0;
  const confidence = normalizeRoutingNumber(input.confidenceAfterCritique ?? input.priorConfidence);
  const riskWeight = input.riskLevel ? RISK_WEIGHT_BY_LEVEL[input.riskLevel] : 0;
  const lengthWeight = getLengthWeight(textLength);
  const targetWeight = getTargetWeight(targets);
  const confidenceWeight = confidence !== null && confidence < 0.65 ? 25 : 0;

  return Math.min(100, riskWeight + lengthWeight + targetWeight + warnings * 8 + confidenceWeight);
}
