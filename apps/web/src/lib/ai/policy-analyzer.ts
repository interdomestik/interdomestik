import {
  policyExtractSchema,
  type PolicyExtract,
} from '@interdomestik/domain-ai/schemas/policy-extract';

export type PolicyAnalysis = PolicyExtract;

const EURO = '\u20ac';
const POUND = '\u00a3';
const CURRENCY_SYMBOLS: Record<string, string> = {
  [EURO]: 'EUR',
  $: 'USD',
  [POUND]: 'GBP',
};

function normalizeText(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim();
}

function extractPolicyNumber(text: string) {
  const patterns = [
    /policy\s*(number|no\.?|#)\s*[:-]?\s*([A-Z0-9-]{4,})/i,
    /policy\s*id\s*[:-]?\s*([A-Z0-9-]{4,})/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[2] ?? match[1] ?? null;
  }

  return null;
}

function extractProvider(text: string) {
  const patterns = [
    /(?:provider|insurer|carrier)\s*[:-]\s*([^.;]{2,80})/i,
    /(?:insured\s+by|underwritten\s+by)\s*[:-]?\s*([^.;]{2,80})/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value) return value;
  }

  return null;
}

function extractLabeledAmount(label: string, text: string) {
  const pattern = new RegExp(
    String.raw`(?:${label})[^0-9]{0,20}?([${EURO}$${POUND}]|EUR|USD|GBP)?\s*([0-9][0-9,.]*)`,
    'i'
  );
  const match = pattern.exec(text);
  if (!match) return null;

  const currencyRaw = match[1] ?? '';
  const amountRaw = match[2] ?? '';
  const currency = CURRENCY_SYMBOLS[currencyRaw] || currencyRaw.toUpperCase() || undefined;
  const amount = amountRaw.replaceAll(',', '').replace(/[.,]$/u, '');

  return { amount, currency };
}

function parseNonNegativeAmount(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function dedupeWarnings(warnings: string[]) {
  return Array.from(new Set(warnings));
}

export async function analyzePolicyText(text: string): Promise<PolicyAnalysis> {
  const normalized = normalizeText(text);
  const provider = extractProvider(normalized);
  const policyNumber = extractPolicyNumber(normalized);
  const coverage = extractLabeledAmount('coverage|limit|sum insured', normalized);
  const deductible = extractLabeledAmount('deductible|excess', normalized);
  const coverageAmount = parseNonNegativeAmount(coverage?.amount);
  const deductibleAmount = parseNonNegativeAmount(deductible?.amount);
  const warnings: string[] = [];

  let summary: string | undefined;
  if (normalized) {
    summary = normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
  }

  if (!provider) {
    warnings.push('Provider could not be extracted from the uploaded policy.');
  }
  if (!policyNumber) {
    warnings.push('Policy number could not be extracted from the uploaded policy.');
  }
  if (coverageAmount === 0) {
    warnings.push('Coverage amount could not be extracted from the uploaded policy.');
  }
  if (deductibleAmount === 0) {
    warnings.push('Deductible could not be extracted from the uploaded policy.');
  }

  return policyExtractSchema.parse({
    provider,
    policyNumber,
    coverageAmount,
    currency: coverage?.currency || deductible?.currency || 'EUR',
    deductible: deductibleAmount,
    confidence: normalized ? 0.68 : 0.32,
    warnings: dedupeWarnings(warnings),
    hiddenPerks: [],
    summary,
  });
}

export async function analyzePolicyImages(_images: Buffer[]): Promise<PolicyAnalysis> {
  return policyExtractSchema.parse({
    provider: null,
    policyNumber: null,
    coverageAmount: 0,
    currency: 'EUR',
    deductible: 0,
    confidence: 0,
    warnings: ['Image analysis is not configured yet.'],
    hiddenPerks: [],
    summary: 'Image analysis is not configured yet.',
  });
}
