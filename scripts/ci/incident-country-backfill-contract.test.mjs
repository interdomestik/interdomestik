import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync('scripts/backfill-incident-country.ts', 'utf8');

test('incident country backfill persists recovery-law routing fields', () => {
  assert.match(script, /recoveryLaw: update\.recoveryLaw/u);
  assert.match(script, /recoveryLegalTenantId: update\.recoveryLegalTenantId/u);
  assert.match(script, /isNull\(claims\.incidentCountryCode\)/u);
});
