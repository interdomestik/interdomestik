import { claimIntakeExtractSchema, type ClaimIntakeExtract } from '../schemas/claim-intake-extract';
import { extractFirstIsoLikeDate, normalizeText, toIsoDate } from '../shared/text';

type ClaimContext = {
  title: string;
  description: string | null | undefined;
  category: string | null | undefined;
  claimAmount: string | number | null | undefined;
  currency: string | null | undefined;
};

type ClaimSnapshot = {
  incidentDate?: string | null | undefined;
};

function extractCountryCode(text: string) {
  const normalized = normalizeText(text);
  const normalizedLower = normalized.toLowerCase();

  for (const label of ['country code', 'country']) {
    const labelIndex = normalizedLower.indexOf(label);
    if (labelIndex < 0) {
      continue;
    }

    let cursor = labelIndex + label.length;
    while (cursor < normalized.length && normalized[cursor] === ' ') {
      cursor += 1;
    }
    if ([':', '=', '-'].includes(normalized[cursor] ?? '')) {
      cursor += 1;
    }
    while (cursor < normalized.length && normalized[cursor] === ' ') {
      cursor += 1;
    }

    const countryCode = normalized.slice(cursor, cursor + 2);
    if (countryCode.length === 2 && countryCode.split('').every(char => /[A-Za-z]/.test(char))) {
      return countryCode.toUpperCase();
    }
  }

  return null;
}

function normalizeCategory(category: string | null | undefined): ClaimIntakeExtract['category'] {
  const normalized = normalizeText(category).toLowerCase();

  if (normalized.includes('travel') || normalized.includes('flight')) return 'travel';
  if (normalized.includes('medical') || normalized.includes('health')) return 'medical';
  if (normalized.includes('property') || normalized.includes('damage')) return 'property';
  if (normalized.includes('liability')) return 'liability';
  return 'other';
}

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = normalizeText(currency).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'EUR';
}

function parseAmount(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replaceAll(',', ''));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export async function extractClaimIntake(args: {
  claim: ClaimContext;
  claimSnapshot?: ClaimSnapshot | null | undefined;
  documentText?: string | null | undefined;
  uploadedAt?: Date | string | null | undefined;
}): Promise<ClaimIntakeExtract> {
  const documentText = normalizeText(args.documentText);
  const description = normalizeText(args.claim.description);
  const warnings: string[] = [];

  const incidentDate =
    toIsoDate(args.claimSnapshot?.incidentDate) ??
    extractFirstIsoLikeDate(documentText) ??
    toIsoDate(args.uploadedAt) ??
    '1970-01-01';
  if (!args.claimSnapshot?.incidentDate && !extractFirstIsoLikeDate(documentText)) {
    warnings.push(
      'Incident date inferred from upload timing because the claim payload was missing it.'
    );
  }

  const countryCode = extractCountryCode(documentText) ?? 'ZZ';
  if (countryCode === 'ZZ') {
    warnings.push('Country code could not be extracted from the uploaded document.');
  }

  const category = normalizeCategory(args.claim.category);
  if (category === 'other' && normalizeText(args.claim.category).length > 0) {
    warnings.push('Claim category was normalized to other.');
  }

  const currency = normalizeCurrency(args.claim.currency);
  if (currency === 'EUR' && normalizeText(args.claim.currency).length === 0) {
    warnings.push('Currency defaulted to EUR.');
  }

  const estimatedAmount = parseAmount(args.claim.claimAmount);
  if (estimatedAmount === 0) {
    warnings.push('Estimated amount defaulted to 0 because no claim amount was available.');
  }

  const summaryParts = [normalizeText(args.claim.title), description, documentText].filter(Boolean);
  const summary =
    summaryParts.join(' ').slice(0, 280) || 'Claim intake extracted from sparse input.';
  const confidence = Math.max(0.35, Math.min(0.92, 0.78 - warnings.length * 0.08));

  return claimIntakeExtractSchema.parse({
    title: normalizeText(args.claim.title) || 'Untitled claim',
    summary,
    category,
    incidentDate,
    countryCode,
    estimatedAmount,
    currency,
    confidence,
    warnings,
  });
}
