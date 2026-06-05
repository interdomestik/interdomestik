import { parseDiasporaOriginFromPublicNote } from './diaspora-origin';
import { resolveClaimIncidentCountry, type ClaimIncidentCountry } from './incident-country';

export type IncidentCountryBackfillSource = 'claim_pack_json' | 'diaspora_origin_note';

export type IncidentCountryBackfillRow = {
  claimPackJson?: unknown;
  diasporaPublicNotes?: Array<string | null | undefined>;
  id: string;
  incidentCountryCode?: string | null;
  incidentJurisdiction?: string | null;
  tenantId: string;
};

export type IncidentCountryBackfillUpdate = ClaimIncidentCountry & {
  claimId: string;
  source: IncidentCountryBackfillSource;
  tenantId: string;
};

export type IncidentCountryBackfillPlan = {
  alreadyPopulated: number;
  rowsExamined: number;
  skippedInvalidSource: number;
  skippedNoDurableSource: number;
  updates: IncidentCountryBackfillUpdate[];
  updatesBySource: Record<IncidentCountryBackfillSource, number>;
};

const CLAIM_PACK_COUNTRY_PATHS = [
  ['answers', 'incidentCountry'],
  ['answers', 'incidentCountryCode'],
  ['input', 'answers', 'incidentCountry'],
  ['input', 'answers', 'incidentCountryCode'],
  ['claimPackInput', 'answers', 'incidentCountry'],
  ['claimPackInput', 'answers', 'incidentCountryCode'],
  ['data', 'answers', 'incidentCountry'],
  ['data', 'input', 'answers', 'incidentCountry'],
] as const;

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringPath(value: unknown, path: readonly string[]): string | null {
  let cursor: unknown = value;
  for (const segment of path) {
    const record = readRecord(cursor);
    if (!record) return null;
    cursor = record[segment];
  }

  return typeof cursor === 'string' ? cursor : null;
}

function resolveCandidate(
  source: IncidentCountryBackfillSource,
  countryCode: string | null
): {
  country: ClaimIncidentCountry;
  invalid: boolean;
  source: IncidentCountryBackfillSource;
} | null {
  if (!countryCode) return null;
  const country = resolveClaimIncidentCountry({ incidentCountryCode: countryCode });
  return country.incidentCountryCode
    ? { country, invalid: false, source }
    : { country, invalid: true, source };
}

function readClaimPackCandidate(row: IncidentCountryBackfillRow) {
  let firstInvalid: ReturnType<typeof resolveCandidate> = null;
  for (const path of CLAIM_PACK_COUNTRY_PATHS) {
    const candidate = resolveCandidate('claim_pack_json', readStringPath(row.claimPackJson, path));
    if (!candidate) continue;
    if (!candidate.invalid) return candidate;
    firstInvalid ??= candidate;
  }

  return firstInvalid;
}

function readDiasporaCandidate(row: IncidentCountryBackfillRow) {
  for (const note of row.diasporaPublicNotes ?? []) {
    const origin = parseDiasporaOriginFromPublicNote(note);
    const candidate = resolveCandidate('diaspora_origin_note', origin?.country ?? null);
    if (candidate) return candidate;
  }

  return null;
}

export function buildIncidentCountryBackfillPlan(
  rows: IncidentCountryBackfillRow[]
): IncidentCountryBackfillPlan {
  const plan: IncidentCountryBackfillPlan = {
    alreadyPopulated: 0,
    rowsExamined: rows.length,
    skippedInvalidSource: 0,
    skippedNoDurableSource: 0,
    updates: [],
    updatesBySource: { claim_pack_json: 0, diaspora_origin_note: 0 },
  };

  for (const row of rows) {
    if (row.incidentCountryCode) {
      plan.alreadyPopulated++;
      continue;
    }

    const candidates = [readClaimPackCandidate(row), readDiasporaCandidate(row)];
    const selected = candidates.find(candidate => candidate && !candidate.invalid);

    if (!selected) {
      if (candidates.some(candidate => candidate?.invalid)) {
        plan.skippedInvalidSource++;
      } else {
        plan.skippedNoDurableSource++;
      }
      continue;
    }

    plan.updates.push({
      claimId: row.id,
      incidentCountryCode: selected.country.incidentCountryCode,
      incidentJurisdiction: selected.country.incidentJurisdiction,
      source: selected.source,
      tenantId: row.tenantId,
    });
    plan.updatesBySource[selected.source]++;
  }

  return plan;
}
