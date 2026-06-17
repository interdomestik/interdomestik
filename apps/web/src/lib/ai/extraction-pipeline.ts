import type { z } from 'zod';

export type ExtractionCritiqueDecision = 'accepted' | 'needs_human_review' | 'failed';

export type ExtractionCritique = {
  decision: ExtractionCritiqueDecision;
  confidence: number;
  warnings: string[];
  warningCodes: string[];
  escalationRecommended: boolean;
  persistenceAllowed: boolean;
};

export type ExtractionCandidate = {
  candidate: unknown;
  modelMetadata?: Record<string, unknown>;
  rawConfidence: number;
  warnings: string[];
};

export type SanitizedContentMetrics = {
  byteLength: number;
  textLength: number;
  hasText: boolean;
};

export class ExtractionPipelineError extends Error {
  constructor(
    readonly errorCode: string,
    message: string
  ) {
    super(message);
    this.name = 'ExtractionPipelineError';
  }
}

export function buildSanitizedContentMetrics(args: {
  buffer: Buffer;
  parsedText?: string | null;
}): SanitizedContentMetrics {
  const parsedText = args.parsedText?.trim() ?? '';
  return {
    byteLength: args.buffer.byteLength,
    textLength: parsedText.length,
    hasText: parsedText.length > 0,
  };
}

export function readCandidateWarnings(candidate: unknown): string[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return [];
  }

  const warnings = (candidate as { warnings?: unknown }).warnings;
  return Array.isArray(warnings)
    ? warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
}

export function readCandidateConfidence(candidate: unknown): number {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return 0;
  }

  const confidence = (candidate as { confidence?: unknown }).confidence;
  return typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0;
}

export function validateExtractionCandidate<T>(
  workflow: string,
  schema: z.ZodType<T>,
  candidate: unknown
): T {
  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new ExtractionPipelineError(
      `${workflow}_validation_failed`,
      `${workflow} output failed schema validation.`
    );
  }

  return result.data;
}

export function critiqueExtraction(args: {
  confidence: number;
  warnings: string[];
  metrics: SanitizedContentMetrics;
}): ExtractionCritique {
  if (args.confidence <= 0 && !args.metrics.hasText) {
    return {
      decision: 'failed',
      confidence: args.confidence,
      warnings: args.warnings,
      warningCodes: ['zero_confidence', 'unusable_content'],
      escalationRecommended: true,
      persistenceAllowed: false,
    };
  }

  const warningCodes: string[] = [];
  if (args.confidence < 0.75) warningCodes.push('low_confidence');
  if (args.warnings.length > 0) warningCodes.push('extraction_warnings');
  if (!args.metrics.hasText || args.metrics.textLength < 50) warningCodes.push('sparse_content');

  const escalationRecommended =
    args.confidence < 0.5 || args.warnings.length >= 3 || warningCodes.includes('sparse_content');
  const decision =
    warningCodes.length === 0 && !escalationRecommended ? 'accepted' : 'needs_human_review';

  return {
    decision,
    confidence: args.confidence,
    warnings: args.warnings,
    warningCodes,
    escalationRecommended,
    persistenceAllowed: true,
  };
}
