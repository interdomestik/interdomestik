import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = readFileSync(path.join(repoRoot, 'scripts/backfill-incident-country.ts'), 'utf8');

test('incident country backfill persists recovery-law routing fields', () => {
  assert.match(script, /recoveryLaw: update\.recoveryLaw/u);
  assert.match(script, /recoveryLegalTenantId: update\.recoveryLegalTenantId/u);
  assert.match(script, /isNull\(claims\.incidentCountryCode\)/u);
  assert.match(script, /isNull\(claims\.recoveryLaw\)/u);
  assert.match(script, /isNull\(claims\.recoveryLegalTenantId\)/u);
});
