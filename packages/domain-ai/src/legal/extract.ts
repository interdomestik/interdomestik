import { legalDocExtractSchema, type LegalDocExtract } from '../schemas/legal-doc-extract';
import { extractFirstIsoLikeDate, normalizeText, toIsoDate } from '../shared/text';

function extractAfterLabel(
  text: string,
  labels: string[],
  stopTokens: string[],
  keepCapitalizedOnly = false
) {
  const normalized = normalizeText(text);
  const normalizedLower = normalized.toLowerCase();

  for (const label of labels) {
    const labelIndex = normalizedLower.indexOf(label);
    if (labelIndex < 0) {
      continue;
    }

    const start = labelIndex + label.length;
    let end = normalized.length;

    for (const stopToken of stopTokens) {
      const stopIndex = normalizedLower.indexOf(stopToken, start);
      if (stopIndex >= 0 && stopIndex < end) {
        end = stopIndex;
      }
    }

    const candidate = normalizeText(normalized.slice(start, end));
    if (!candidate) {
      continue;
    }
    if (keepCapitalizedOnly && !/^[A-Z]/.test(candidate)) {
      continue;
    }

    return candidate.replace(/[.,]$/u, '').trim();
  }

  return '';
}

function detectDocumentType(text: string, fileName: string): LegalDocExtract['documentType'] {
  const haystack = `${text} ${fileName}`.toLowerCase();

  if (haystack.includes('court filing') || haystack.includes('complaint')) return 'court_filing';
  if (haystack.includes('demand letter')) return 'demand_letter';
  if (haystack.includes('settlement')) return 'settlement_offer';
  if (haystack.includes('policy notice')) return 'policy_notice';
  if (haystack.includes('regulatory')) return 'regulatory_notice';
  return 'other';
}

function extractIssuer(text: string) {
  return extractAfterLabel(text, ['issued by ', 'from '], [' in ', ' on ', '.', ',']);
}

function extractJurisdiction(text: string) {
  return (
    extractAfterLabel(text, ['jurisdiction:', 'jurisdiction=', 'jurisdiction-'], ['.', ',']) ||
    extractAfterLabel(text, ['in '], [' on ', '.', ','], true)
  );
}

function extractEffectiveDate(text: string) {
  return extractFirstIsoLikeDate(text);
}

function extractObligations(text: string) {
  return text
    .split('.')
    .map(sentence => normalizeText(sentence))
    .flatMap(sentence => {
      const normalizedLower = sentence.toLowerCase();
      for (const marker of [' must ', ' shall ', 'must ', 'shall ']) {
        const markerIndex = normalizedLower.indexOf(marker);
        if (markerIndex < 0) {
          continue;
        }

        const obligation = normalizeText(sentence.slice(markerIndex).replace(/^you\s+/i, ''));
        return obligation ? [obligation] : [];
      }

      return [];
    });
}

export async function extractLegalDocument(args: {
  documentText?: string | null;
  fileName?: string | null;
  uploadedAt?: Date | string | null;
}): Promise<LegalDocExtract> {
  const text = normalizeText(args.documentText);
  const fileName = normalizeText(args.fileName);
  const warnings: string[] = [];

  const documentType = detectDocumentType(text, fileName);
  const issuer = extractIssuer(text) || 'Unknown issuer';
  if (issuer === 'Unknown issuer') {
    warnings.push('Issuer could not be extracted from the uploaded legal document.');
  }

  const jurisdiction = extractJurisdiction(text) || 'Unknown jurisdiction';
  if (jurisdiction === 'Unknown jurisdiction') {
    warnings.push('Jurisdiction could not be extracted from the uploaded legal document.');
  }

  const extractedEffectiveDate = extractEffectiveDate(text);
  const effectiveDate = extractedEffectiveDate ?? toIsoDate(args.uploadedAt) ?? '1970-01-01';
  if (!extractedEffectiveDate) {
    warnings.push(
      'Effective date was inferred from upload timing because the document text was sparse.'
    );
  }

  if (!text) {
    warnings.push('Document text was empty; extraction was derived from file metadata only.');
  }

  const obligations = extractObligations(text);
  const summary =
    text.slice(0, 280) ||
    `Uploaded legal document ${fileName || 'document'} requires manual review.`;
  const confidence = Math.max(0.25, Math.min(0.9, 0.76 - warnings.length * 0.1));

  return legalDocExtractSchema.parse({
    documentType,
    issuer,
    jurisdiction,
    effectiveDate,
    summary,
    obligations,
    confidence,
    warnings,
  });
}
