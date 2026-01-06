export type PolicyAnalysis = {
  provider?: string;
  policyNumber?: string | null;
  coverageAmount?: number | string;
  currency?: string;
  deductible?: number | string;
  hiddenPerks?: string[];
  summary?: string;
};

const EURO = '\u20ac';
const POUND = '\u00a3';
const CURRENCY_SYMBOLS: Record<string, string> = {
  [EURO]: 'EUR',
  $: 'USD',
  [POUND]: 'GBP',
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractPolicyNumber(text: string) {
  const patterns = [
    /policy\s*(number|no\.?|#)\s*[:\-]?\s*([A-Z0-9-]{4,})/i,
    /policy\s*id\s*[:\-]?\s*([A-Z0-9-]{4,})/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[2] ?? match[1] ?? null;
  }

  return null;
}

function extractLabeledAmount(label: string, text: string) {
  const pattern = new RegExp(
    `${label}[^0-9]{0,20}([${EURO}$${POUND}]|EUR|USD|GBP)?\\s*([0-9][0-9,\\.]+)`,
    'i'
  );
  const match = pattern.exec(text);
  if (!match) return null;

  const currencyRaw = match[1] ?? '';
  const amountRaw = match[2] ?? '';
  const currency = CURRENCY_SYMBOLS[currencyRaw] || currencyRaw || undefined;
  const amount = amountRaw.replaceAll(',', '');

  return { amount, currency };
}

export async function analyzePolicyText(text: string): Promise<PolicyAnalysis> {
  const normalized = normalizeText(text);
  const policyNumber = extractPolicyNumber(normalized);
  const coverage = extractLabeledAmount('coverage|limit|sum insured', normalized);
  const deductible = extractLabeledAmount('deductible|excess', normalized);

  const summary = normalized
    ? `${normalized.slice(0, 220)}${normalized.length > 220 ? '...' : ''}`
    : undefined;

  return {
    provider: undefined,
    policyNumber,
    coverageAmount: coverage?.amount,
    currency: coverage?.currency || deductible?.currency,
    deductible: deductible?.amount,
    hiddenPerks: [],
    summary,
  };
}

export async function analyzePolicyImages(_images: Buffer[]): Promise<PolicyAnalysis> {
  return {
    provider: undefined,
    policyNumber: null,
    hiddenPerks: [],
    summary: 'Image analysis is not configured yet.',
  };
}
