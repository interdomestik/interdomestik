import assert from 'node:assert/strict';
import { C1_ADMISSIONS } from './tenant-guard/c1-admissions.mjs';
import { sha256 } from './tenant-guard/rules.mjs';
import { assertRefused } from './tenant-guard-test-support.mjs';

const DOCUMENTS = 'apps/web/src/app/api/documents';
const CORE = `${DOCUMENTS}/_core.ts`;
const HELPER = `${DOCUMENTS}/branch-manager-document-boundary.ts`;
const CONTEXTS = 'apps/web/src/contexts.ts';
const CALLER = 'apps/web/src/attack.ts';
const HANDED = /module state .*#CONTEXTS .* is passed to changed code \(getDocumentAccessCore\)/u;

/** Check the real successor shape, then exercise its closure units with a bounded fixture. */
export function assertDocumentBoundaryAdmission(runAdmitted) {
  const base = C1_ADMISSIONS.find(item => item.id === 'tx-lifetime-staff-draft-grants-2026-11');
  const next = C1_ADMISSIONS.find(
    item => item.id === 'tx-lifetime-branch-manager-content-denial-2026-11'
  );
  assert.equal(next.files.length, base.files.length + 1);
  assert.deepEqual(next.sinkEdges, base.sinkEdges);
  for (const entry of base.files) {
    const rebound = next.files.find(item => item.file === entry.file);
    if (entry.file === CORE) {
      assert.notEqual(rebound.sha256, entry.sha256);
      assert.deepEqual(rebound.units, ['getDocumentAccessCore']);
    } else assert.deepEqual(rebound, entry);
  }
  assert.deepEqual(next.files.find(item => item.file === HELPER).units, [
    'deniesClaimDocumentContent',
  ]);

  // Retained tenant state reaches the changed core and its changed helper, just as the GET
  // storage handoff's closure reaches the D1 helper. Both units must be admitted separately.
  const trusted = {
    [CONTEXTS]: [
      "import { withTenantContext } from '@interdomestik/database';",
      "export const CONTEXTS = [{ tenantId: 'tenant-A' }];",
      'export function readFirst() { return withTenantContext(CONTEXTS[0], tx => tx.select()); }',
    ].join('\n'),
    [CALLER]: [
      "import { CONTEXTS } from './contexts';",
      "import { getDocumentAccessCore } from './app/api/documents/_core';",
      'export function attack() { return getDocumentAccessCore(CONTEXTS); }',
    ].join('\n'),
    [CORE]:
      'export function getDocumentAccessCore(value: readonly unknown[]) { return value.length; }',
  };
  const changes = Object.fromEntries(next.files.map(entry => [entry.file, 'export {};\n']));
  changes[CORE] = [
    "import { deniesClaimDocumentContent } from './branch-manager-document-boundary';",
    'export function getDocumentAccessCore(value: readonly unknown[]) {',
    '  return deniesClaimDocumentContent(value.length);',
    '}',
  ].join('\n');
  changes[HELPER] =
    'export function deniesClaimDocumentContent(value: number) { return value === 1; }';
  const admission = {
    ...next,
    files: next.files.map(entry => ({ ...entry, sha256: sha256(changes[entry.file]) })),
  };
  const accepted = runAdmitted(changes, [admission], trusted);
  assert.deepEqual(accepted.violations, []);
  assert.equal(accepted.telemetry.c1Admissions, 1);
  const partial = { ...changes };
  delete partial[HELPER];
  for (const candidate of [partial, { ...changes, [HELPER]: `${changes[HELPER]}\n// drift` }]) {
    const refused = runAdmitted(candidate, [admission], trusted);
    assertRefused(refused, 'C1', HANDED);
    assert.equal(refused.telemetry.c1Admissions, 0);
  }
  const missingUnit = {
    ...admission,
    files: admission.files.map(entry => (entry.file === HELPER ? { ...entry, units: [] } : entry)),
  };
  const refused = runAdmitted(changes, [missingUnit], trusted);
  assert.equal(refused.telemetry.c1Admissions, 1);
  assertRefused(refused, 'C1', HANDED);
}
