import { claimSummarySchema, type ClaimSummary } from '../schemas/claim-summary';

type ClaimSummaryContext = {
  title: string;
  description: string | null | undefined;
  category: string | null | undefined;
  companyName: string | null | undefined;
  claimAmount: string | number | null | undefined;
  currency: string | null | undefined;
};

type ExtractionSummary = {
  summary?: string | null;
  warnings?: string[] | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replaceAll(/\s+/g, ' ').trim();
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

function getUrgency(amount: number): ClaimSummary['urgency'] {
  if (amount >= 5000) return 'high';
  if (amount >= 1000) return 'medium';
  return 'low';
}

export async function summarizeClaim(args: {
  claim: ClaimSummaryContext;
  extractions?: ExtractionSummary[] | null;
}): Promise<ClaimSummary> {
  const amount = parseAmount(args.claim.claimAmount);
  const extractionWarnings = (args.extractions ?? []).flatMap(extraction =>
    Array.isArray(extraction.warnings) ? extraction.warnings.filter(Boolean) : []
  );

  const summary = [
    normalizeText(args.claim.title),
    normalizeText(args.claim.description),
    normalizeText(args.extractions?.[0]?.summary),
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 320);

  const keyPoints = [
    `Category: ${normalizeText(args.claim.category) || 'other'}`,
    `Company: ${normalizeText(args.claim.companyName) || 'Unknown company'}`,
  ];

  if (amount > 0) {
    keyPoints.push(
      `Estimated amount: ${amount.toFixed(2)} ${normalizeText(args.claim.currency) || 'EUR'}`
    );
  }

  const recommendedActions: string[] = [];
  if (extractionWarnings.length > 0) {
    recommendedActions.push('Review extraction warnings before contacting the counterparty.');
  }
  if (normalizeText(args.claim.description).length === 0) {
    recommendedActions.push('Collect a fuller claimant narrative.');
  }

  const urgency = getUrgency(amount);
  const confidence = extractionWarnings.length > 0 ? 0.62 : 0.74;

  return claimSummarySchema.parse({
    summary: summary || 'Claim summary generated from limited context.',
    keyPoints,
    recommendedActions,
    urgency,
    confidence,
    warnings: extractionWarnings,
  });
}
