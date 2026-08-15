import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(
  new URL('../../apps/web/e2e/gate/gate-project-identity.ts', import.meta.url),
  'utf8'
);
const adminGate = readFileSync(
  new URL('../../apps/web/e2e/gate/admin-tenant-classification-gate.spec.ts', import.meta.url),
  'utf8'
);

test('gate project identity uses exact KS and MK allowlists only', () => {
  assert.match(helper, /projectName === 'gate-ks-sq'/u);
  assert.match(helper, /projectName === 'gate-mk-mk' \|\| projectName === 'gate-mk-contract'/u);
  assert.equal([...helper.matchAll(/projectName ===/gu)].length, 3);
  assert.doesNotMatch(helper, /\.(includes|startsWith|endsWith|match|test)\(|RegExp/u);
  assert.doesNotMatch(helper, /getTenantFromTestInfo/u);
  for (const rejected of ['ks-sq', 'mk-mk', 'smoke', 'pilot', 'regression', 'arbitrary']) {
    assert.doesNotMatch(helper, new RegExp(`['\"]${rejected}['\"]`, 'u'));
  }
});

test('admin tenant classification consumes the narrow gate identity helper', () => {
  assert.match(adminGate, /from '\.\/gate-project-identity'/u);
  assert.match(adminGate, /isKsProject: testInfo => isKsGateProject\(testInfo\.project\.name\)/u);
  assert.match(adminGate, /isMkProject: testInfo => isMkGateProject\(testInfo\.project\.name\)/u);
  assert.doesNotMatch(adminGate, /getTenantFromTestInfo|\.includes\(/u);
});
