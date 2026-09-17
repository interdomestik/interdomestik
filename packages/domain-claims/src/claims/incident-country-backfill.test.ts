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
  it('prefers claim-pack country to diaspora notes', () => {
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
        recoveryLaw: null,
        recoveryLegalTenantId: null,
        source: 'claim_pack_json',
        tenantId: 'tenant-1',
      },
    ]);
    expect(plan.updatesBySource).toEqual({
      claim_pack_json: 1,
      diaspora_origin_note: 0,
      existing_incident_country: 0,
    });
  });

  it('uses a later valid claim-pack country', () => {
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

  it('backfills only legacy authoritative diaspora notes', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({ id: 'claim-2', diasporaPublicNotes: [diasporaNote] }),
      row({
        id: 'claim-3',
        diasporaPublicNotes: [
          'Member-submitted Diaspora/Green Card guidance: IT; not incident-country authority.',
        ],
      }),
    ]);

    expect(plan.updates).toEqual([
      expect.objectContaining({
        claimId: 'claim-2',
        incidentCountryCode: 'IT',
        incidentJurisdiction: 'country:IT',
        source: 'diaspora_origin_note',
      }),
    ]);
    expect(plan.skippedNoDurableSource).toBe(1);
  });

  it('includes supported-country recovery routing', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({ claimPackJson: { answers: { incidentCountryCode: 'MK' } } }),
    ]);

    expect(plan.updates).toEqual([
      expect.objectContaining({
        claimId: 'claim-1',
        incidentCountryCode: 'MK',
        recoveryLaw: 'MK',
        recoveryLegalTenantId: 'tenant_mk',
      }),
    ]);
  });

  it('completes routing for an existing country', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({
        incidentCountryCode: 'XK',
        incidentJurisdiction: 'country:XK',
        recoveryLaw: null,
        recoveryLegalTenantId: null,
      }),
    ]);

    expect(plan.updates).toEqual([
      expect.objectContaining({
        claimId: 'claim-1',
        incidentCountryCode: 'XK',
        recoveryLaw: 'XK',
        recoveryLegalTenantId: 'tenant_ks',
        source: 'existing_incident_country',
      }),
    ]);
  });

  it('leaves fully routed rows unchanged', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({
        claimPackJson: { answers: { incidentCountry: 'DE' } },
        incidentCountryCode: 'XK',
        incidentJurisdiction: 'country:XK',
        recoveryLaw: 'XK',
        recoveryLegalTenantId: 'tenant_ks',
      }),
    ]);

    expect(plan.alreadyPopulated).toBe(1);
    expect(plan.updates).toEqual([]);
  });

  it('does not route unsupported existing countries', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({ incidentCountryCode: 'CH', incidentJurisdiction: 'country:CH' }),
    ]);

    expect(plan.alreadyPopulated).toBe(1);
    expect(plan.updates).toEqual([]);
  });

  it('separates invalid from missing sources', () => {
    const plan = buildIncidentCountryBackfillPlan([
      row({ claimPackJson: { answers: { incidentCountry: 'Germany' } } }),
      row({ id: 'claim-2', diasporaPublicNotes: ['Member added a receipt.'] }),
    ]);

    expect(plan.skippedInvalidSource).toBe(1);
    expect(plan.skippedNoDurableSource).toBe(1);
    expect(plan.updates).toEqual([]);
  });
});
