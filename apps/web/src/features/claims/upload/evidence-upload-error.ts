import { EVIDENCE_FORMAT_LABEL } from './evidence-file-policy';

export type EvidenceErrorTranslator = (
  key: 'unsupported' | 'tooLarge' | 'empty' | 'contentMismatch' | 'failed',
  values?: Record<string, string | number>
) => string;

export function evidenceUploadErrorMessage(
  error: unknown,
  translate: EvidenceErrorTranslator,
  limitMB = 10
): string {
  const code = error instanceof Error ? error.message : error;
  switch (code) {
    case 'evidence_unsupported':
      return translate('unsupported', { formats: EVIDENCE_FORMAT_LABEL });
    case 'evidence_too_large':
      return translate('tooLarge', { limit: limitMB });
    case 'evidence_empty':
      return translate('empty');
    case 'evidence_content_mismatch':
      return translate('contentMismatch');
    default:
      return translate('failed');
  }
}

export function isTerminalEvidenceError(error: string): boolean {
  return [
    'evidence_unsupported',
    'evidence_too_large',
    'evidence_empty',
    'evidence_content_mismatch',
  ].includes(error);
}
