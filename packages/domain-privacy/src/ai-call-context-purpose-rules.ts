import type { AICallContextInvalidReason } from './ai';

export function appendPurposeReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (input.posture === 'disabled' && input.purpose !== 'general_case') {
    reasons.push('disabled_posture_requires_general_case');
  }
  if (input.purpose === 'document_extraction') appendDocumentExtractionReasons(input, reasons);
  if (input.purpose === 'invalidity_review') appendInvalidityReviewReasons(input, reasons);
}

function appendDocumentExtractionReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (input.processingPurpose !== 'ai_document_extraction') {
    reasons.push('processing_purpose_mismatch');
  }
  if (input.retention !== 'zero_retention_no_training') {
    reasons.push('document_extraction_requires_zero_retention');
  }
  if (input.consent !== 'required_granted') reasons.push('document_extraction_requires_consent');
}

function appendInvalidityReviewReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (input.processingPurpose !== 'invalidity_review') reasons.push('processing_purpose_mismatch');
  if (
    input.posture !== 'human_review_required' ||
    input.invalidityPosture !== 'human_review_required'
  ) {
    reasons.push('invalidity_review_requires_human_review');
  }
  if (input.consent !== 'required_granted') reasons.push('invalidity_review_requires_consent');
}
