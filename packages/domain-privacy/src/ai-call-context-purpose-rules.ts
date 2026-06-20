import type { AICallContextInvalidReason } from './ai';
import { readOwnValue } from './ai-call-context-own-value';

export function appendPurposeReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  const posture = readOwnValue(input, 'posture');
  const purpose = readOwnValue(input, 'purpose');

  if (posture === 'disabled' && purpose !== 'general_case') {
    reasons.push('disabled_posture_requires_general_case');
  }
  if (purpose === 'document_extraction') appendDocumentExtractionReasons(input, reasons);
  if (purpose === 'invalidity_review') appendInvalidityReviewReasons(input, reasons);
}

function appendDocumentExtractionReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (readOwnValue(input, 'processingPurpose') !== 'ai_document_extraction') {
    reasons.push('processing_purpose_mismatch');
  }
  if (readOwnValue(input, 'retention') !== 'zero_retention_no_training') {
    reasons.push('document_extraction_requires_zero_retention');
  }
  if (readOwnValue(input, 'consent') !== 'required_granted') {
    reasons.push('document_extraction_requires_consent');
  }
}

function appendInvalidityReviewReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (readOwnValue(input, 'processingPurpose') !== 'invalidity_review') {
    reasons.push('processing_purpose_mismatch');
  }
  if (
    readOwnValue(input, 'posture') !== 'human_review_required' ||
    readOwnValue(input, 'invalidityPosture') !== 'human_review_required'
  ) {
    reasons.push('invalidity_review_requires_human_review');
  }
  if (readOwnValue(input, 'retention') !== 'zero_retention_no_training') {
    reasons.push('invalidity_review_requires_zero_retention');
  }
  if (readOwnValue(input, 'consent') !== 'required_granted') {
    reasons.push('invalidity_review_requires_consent');
  }
}
