import { legalDocExtractSchema, type LegalDocExtract } from '../schemas/legal-doc-extract';

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replaceAll(/\s+/g, ' ').trim();
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
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
  const match =
    text.match(/\bissued by\s+([^.,]+?)(?:\s+in\s+|\s+on\s+|[.,])/i) ??
    text.match(/\bfrom\s+([^.,]+?)(?:\s+in\s+|\s+on\s+|[.,])/i);
  return normalizeText(match?.[1]);
}

function extractJurisdiction(text: string) {
  const match =
    text.match(/\bin\s+([A-Z][A-Za-z ]+?)(?:\s+on\s+|[.,])/i) ??
    text.match(/\bjurisdiction[:=-]?\s*([A-Z][A-Za-z ]+?)(?:[.,]|$)/i);
  return normalizeText(match?.[1]);
}

function extractEffectiveDate(text: string) {
  const match = text.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function extractObligations(text: string) {
  const matches = text.match(/\b(?:must|shall)\s+[^.]+/gi) ?? [];
  return matches.map(match => normalizeText(match));
}

export async function extractLegalDocument(args: {
  documentText?: string | null | undefined;
  fileName?: string | null | undefined;
  uploadedAt?: Date | string | null | undefined;
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

  const effectiveDate = extractEffectiveDate(text) ?? toIsoDate(args.uploadedAt) ?? '1970-01-01';
  if (!extractEffectiveDate(text)) {
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
