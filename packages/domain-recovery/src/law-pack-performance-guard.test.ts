import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createLawPackRegistry,
  resolveRecoveryLawFromLawPack,
  type LawPack,
  type LawPackLoader,
} from './index';

type Country = 'MK' | 'XK' | 'DE';

function lawPack(countryCode: Country): LawPack {
  return {
    countryCode,
    recoveryLaw: countryCode,
    recoveryLegalTenantId: `tenant_${countryCode.toLowerCase()}`,
    regulatedActivityNoteRequired: true,
    owner: 'domain-recovery-test',
    effectiveFrom: '2026-06-20',
    lastReviewed: '2026-06-20',
    sourceReferences: [`test:${countryCode.toLowerCase()}`],
  };
}

test('T-205b loads one law pack per country per warm isolate', async () => {
  const loads: Record<Country, number> = { DE: 0, MK: 0, XK: 0 };
  const loaderFor =
    (countryCode: Country): LawPackLoader =>
    () => {
      loads[countryCode] += 1;
      return lawPack(countryCode);
    };
  const registry = createLawPackRegistry({
    DE: loaderFor('DE'),
    MK: loaderFor('MK'),
    XK: loaderFor('XK'),
  });

  assert.deepEqual(loads, { DE: 0, MK: 0, XK: 0 });

  const [firstMk, secondMk] = await Promise.all([
    registry.loadLawPack('mk'),
    registry.loadLawPack(' MK '),
  ]);
  const firstXk = await registry.loadLawPack('XK');
  const thirdMk = await registry.loadLawPack('MK');

  assert.equal(firstMk, secondMk);
  assert.equal(firstMk, thirdMk);
  assert.equal(firstMk.countryCode, 'MK');
  assert.equal(firstXk.countryCode, 'XK');
  assert.deepEqual(loads, { DE: 0, MK: 1, XK: 1 });
});

test('T-205b transition and assistance checks load only the explicit incident country', async () => {
  const requestedCountries: Array<string | null | undefined> = [];
  const loads: Record<Country, number> = { DE: 0, MK: 0, XK: 0 };
  const loaderFor =
    (countryCode: Country): LawPackLoader =>
    () => {
      loads[countryCode] += 1;
      if (countryCode === 'DE') throw new Error('all-country law-pack load must not run');
      return lawPack(countryCode);
    };
  const registry = createLawPackRegistry({
    DE: loaderFor('DE'),
    MK: loaderFor('MK'),
    XK: loaderFor('XK'),
  });
  const loadLawPack = async (countryCode: string | null | undefined) => {
    requestedCountries.push(countryCode);
    return registry.loadLawPack(countryCode);
  };

  for (const incidentCountryCode of ['MK', 'XK'] as const) {
    const resolution = await resolveRecoveryLawFromLawPack({
      incidentCountryCode,
      loadLawPack,
    });

    assert.equal(resolution.outcome, 'recovery_law_resolved');
    assert.equal(resolution.incidentCountryCode, incidentCountryCode);
    assert.equal(resolution.recoveryLaw, incidentCountryCode);
  }

  assert.deepEqual(requestedCountries, ['MK', 'XK']);
  assert.deepEqual(loads, { DE: 0, MK: 1, XK: 1 });
});
