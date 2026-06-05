import { describe, expect, it } from 'vitest';

import {
  buildIncidentCountryBackfillPlan,
  type IncidentCountryBackfillRow,
} from './incident-country-backfill';

const diasporaNote =
  'Started from Diaspora / Green Card quickstart. Country: IT. Incident location: abroad.';

function row(overrides: Partial<IncidentCountryBackfillRow> = {}): IncidentCountryBackfillRow {
  return {
    id: 'claim-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('buildIncidentCountryBackfillPlan', () => {
  it('prefers claim-pack JSON country over diaspora notes for missing rows', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({
        claimPackJson: { answers: { incidentCountry: ' de ' } },
        diasporaPublicNotes: [diasporaNote],
      }),
    ]);

    expect(plan.updates).toEqual([
      {
        claimId: 'claim-1',
        incidentCountryCode: 'DE',
        incidentJurisdiction: 'country:DE',
        source: 'claim_pack_json',
        tenantId: 'tenant-1',
      },
    ]);
    expect(plan.updatesBySource).toEqual({ claim_pack_json: 1, diaspora_origin_note: 0 });
  });

  it('uses a later valid claim-pack country code when an earlier value is invalid', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({
        claimPackJson: { answers: { incidentCountry: 'Germany', incidentCountryCode: 'DE' } },
      }),
    ]);

    expect(plan.updates).toEqual([
      expect.objectContaining({
        claimId: 'claim-1',
        incidentCountryCode: 'DE',
        source: 'claim_pack_json',
      }),
    ]);
    expect(plan.skippedInvalidSource).toBe(0);
  });

  it('uses diaspora origin notes when no claim-pack JSON source exists', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({ id: 'claim-2', diasporaPublicNotes: [diasporaNote] }),
    ]);

    expect(plan.updates).toEqual([
      expect.objectContaining({
        claimId: 'claim-2',
        incidentCountryCode: 'IT',
        incidentJurisdiction: 'country:IT',
        source: 'diaspora_origin_note',
      }),
    ]);
  });

  it('does not plan updates for rows that already have live incident-country values', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({
        claimPackJson: { answers: { incidentCountry: 'DE' } },
        incidentCountryCode: 'CH',
        incidentJurisdiction: 'country:CH',
      }),
    ]);

    expect(plan.alreadyPopulated).toBe(1);
    expect(plan.updates).toEqual([]);
  });

  it('reports invalid source values separately from missing durable sources', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({ claimPackJson: { answers: { incidentCountry: 'Germany' } } }),
      row({ id: 'claim-2', diasporaPublicNotes: ['Member added a receipt.'] }),
    ]);

    expect(plan.skippedInvalidSource).toBe(1);
    expect(plan.skippedNoDurableSource).toBe(1);
    expect(plan.updates).toEqual([]);
  });
});
