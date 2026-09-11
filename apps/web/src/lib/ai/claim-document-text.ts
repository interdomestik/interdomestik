import { ExtractionPipelineError } from './extraction-pipeline';

const UNSUPPORTED_DOCUMENT_TYPE_CODE = 'claim_ai_unsupported_document_type';

export async function analyzeClaimDocumentAsText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'text/plain') return buffer.toString('utf8');

  if (mimeType !== 'application/pdf') {
    throw new ExtractionPipelineError(
      UNSUPPORTED_DOCUMENT_TYPE_CODE,
      `Claim AI extraction does not support document type ${mimeType || 'unknown'}.`
    );
  }

  const pdfModule = await import('pdf-parse');
  const pdf = pdfModule.default ?? pdfModule;
  const result = await pdf(buffer);
  return result.text ?? '';
}
