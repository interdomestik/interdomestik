import assert from 'node:assert/strict';
import test from 'node:test';
import { C1_ADMISSIONS } from './tenant-guard/c1-admissions.mjs';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate, sha256 } from './tenant-guard/rules.mjs';
import { KERNEL, PACKAGES, assertRefused, pinsOf } from './tenant-guard-test-support.mjs';

// Reviewed C1 admissions: an exact, complete bundle may stand in for C1's unchanged-unit
// requirement on its named units and sink edges only; anything else is judged as before.

const ATTACK = 'apps/web/src/attack.ts';
const HELPER = 'apps/web/src/helper.ts';
const LEGACY_SINK = 'apps/web/src/legacy.ts#readForTenant';
const FORWARD_SINK = 'apps/web/src/forwarder.ts#forward';

const caller = [
  "import { readForTenant } from './legacy';",
  'export async function attack(input: { tenantId: string }) { return readForTenant(input.tenantId); }',
].join('\n');
const helper = 'export const helperValue = 1;\n';

function admissionFor(files, { units = ['attack'], sinkEdges } = {}) {
  return {
    id: 'fixture',
    reason: 'fixture admission',
    files: Object.entries(files).map(([file, text]) => ({
      file,
      sha256: sha256(text),
      units: file === ATTACK ? units : [],
    })),
    sinkEdges: sinkEdges ?? [{ file: ATTACK, unit: 'attack', sink: LEGACY_SINK }],
  };
}

function runAdmitted(changes, admissions, base = {}) {
  const trusted = new Map(Object.entries({ ...KERNEL, ...base }));
  const sources = new Map(trusted);
  for (const [file, text] of Object.entries(changes)) sources.set(file, text);
  const graph = createModuleGraph({
    sources,
    packages: PACKAGES,
    appAliases: [['@/', 'apps/web/src/']],
  });
  return evaluate({
    sources,
    trusted,
    graph,
    contracts: [],
    legacyPins: pinsOf(trusted),
    admissions,
  });
}

const CHANGED_CALLER =
  /changed caller hands a tenant to unchanged legacy apps\/web\/src\/legacy.ts#readForTenant/u;

test('without an admission a changed caller handing a tenant to legacy code is refused', () => {
  assertRefused(runAdmitted({ [ATTACK]: caller }, []), 'C1', CHANGED_CALLER);
});

test('the exact reviewed bundle admits its named unit and sink edge', () => {
  const result = runAdmitted({ [ATTACK]: caller, [HELPER]: helper }, [
    admissionFor({ [ATTACK]: caller, [HELPER]: helper }),
  ]);
  assert.deepEqual(result.violations, []);
  assert.equal(result.telemetry.c1Admissions, 1);
});

test('one changed byte anywhere in the bundle leaves the admission dormant', () => {
  const admission = admissionFor({ [ATTACK]: caller, [HELPER]: helper });
  const edited = runAdmitted({ [ATTACK]: `${caller}\n// edited`, [HELPER]: helper }, [admission]);
  assertRefused(edited, 'C1', CHANGED_CALLER);
  assert.equal(edited.telemetry.c1Admissions, 0);
  const partial = runAdmitted({ [ATTACK]: caller }, [admission]);
  assertRefused(partial, 'C1', CHANGED_CALLER);
  assert.equal(partial.telemetry.c1Admissions, 0);
});

test('a new caller in a reviewed file is not admitted by its neighbour', () => {
  const twoCallers = [
    caller,
    'export async function sibling(tenantId: string) { return readForTenant(tenantId); }',
  ].join('\n');
  const result = runAdmitted({ [ATTACK]: twoCallers }, [admissionFor({ [ATTACK]: twoCallers })]);
  assert.equal(result.telemetry.c1Admissions, 1);
  assertRefused(result, 'C1', CHANGED_CALLER);
  assert.ok(result.violations.every(violation => violation.unit === 'sibling'));
});

test('an admitted unit reaches only its listed sink edges', () => {
  const both = [
    "import { readForTenant } from './legacy';",
    "import { forward } from './forwarder';",
    'export async function attack(tenantId: string) {',
    '  await readForTenant(tenantId);',
    '  return forward(tenantId);',
    '}',
  ].join('\n');
  const result = runAdmitted({ [ATTACK]: both }, [admissionFor({ [ATTACK]: both })]);
  assertRefused(
    result,
    'C1',
    /changed caller hands a tenant to unchanged legacy apps\/web\/src\/forwarder.ts#forward/u
  );
  assert.ok(!result.violations.some(violation => CHANGED_CALLER.test(violation.detail)));
  const listed = admissionFor(
    { [ATTACK]: both },
    {
      sinkEdges: [
        { file: ATTACK, unit: 'attack', sink: LEGACY_SINK },
        { file: ATTACK, unit: 'attack', sink: FORWARD_SINK },
      ],
    }
  );
  assert.deepEqual(runAdmitted({ [ATTACK]: both }, [listed]).violations, []);
});

test('an admitted unit is still changed code for every other rule', () => {
  const direct = [
    "import { withTenantContext } from '@interdomestik/database';",
    'export async function attack(input: { tenantId: string }) {',
    '  return withTenantContext({ tenantId: input.tenantId }, tx => tx.select());',
    '}',
  ].join('\n');
  const result = runAdmitted({ [ATTACK]: direct }, [admissionFor({ [ATTACK]: direct })]);
  assertRefused(result, 'C1', /withTenantContext in a changed unit/u);
});

test('the repository admissions are complete, frozen and name only bundled units', () => {
  assert.ok(Object.isFrozen(C1_ADMISSIONS));
  for (const admission of C1_ADMISSIONS) {
    assert.ok(admission.reason.length > 40, `${admission.id} needs a reviewed reason`);
    const units = new Set(
      admission.files.flatMap(entry => entry.units.map(unit => `${entry.file}#${unit}`))
    );
    for (const entry of admission.files) assert.match(entry.sha256, /^[0-9a-f]{64}$/u);
    for (const edge of admission.sinkEdges) {
      assert.ok(units.has(`${edge.file}#${edge.unit}`), `${edge.unit} is not an admitted unit`);
    }
  }
});

// The closure hook: retained tenant state handed to an admitted callee. The callee's closure is
// admitted only through its own bundle; anything it reaches outside the bundle is judged as before.
const CONTEXTS = 'apps/web/src/contexts.ts';
const REWRITE = 'apps/web/src/rewrite.ts';
const NORMALIZE = 'apps/web/src/normalize.ts';
const STATE_BASE = {
  [CONTEXTS]: [
    "import { withTenantContext } from '@interdomestik/database';",
    "export const CONTEXTS = [{ tenantId: 'tenant-A' }];",
    'export function readFirst() {',
    '  return withTenantContext(CONTEXTS[0], tx => tx.select());',
    '}',
  ].join('\n'),
  [NORMALIZE]: 'export function normalize(value: number) { return value; }\n',
  [REWRITE]: [
    "import { normalize } from './normalize';",
    'export function rewrite(value: readonly unknown[]) { return normalize(value.length); }',
  ].join('\n'),
  [ATTACK]: [
    "import { CONTEXTS } from './contexts';",
    "import { rewrite } from './rewrite';",
    'export function attack() { return rewrite(CONTEXTS); }',
  ].join('\n'),
};
const REVIEWED_REWRITE = [
  "import { normalize } from './normalize';",
  'export function rewrite(value: readonly unknown[]) { return normalize(value.length + 0); }',
].join('\n');
const HANDED = /module state .*#CONTEXTS .* is passed to changed code \(rewrite\)/u;
const rewriteAdmission = text => ({
  id: 'fixture-closure',
  reason: 'fixture admission',
  files: [{ file: REWRITE, sha256: sha256(text), units: ['rewrite'] }],
  sinkEdges: [],
});

test('retained state handed to an admitted callee passes only with its exact bundle', () => {
  const changes = { [REWRITE]: REVIEWED_REWRITE };
  assertRefused(runAdmitted(changes, [], STATE_BASE), 'C1', HANDED);
  const admitted = runAdmitted(changes, [rewriteAdmission(REVIEWED_REWRITE)], STATE_BASE);
  assert.deepEqual(admitted.violations, []);
  assert.equal(admitted.telemetry.c1Admissions, 1);
  const broken = runAdmitted(
    { [REWRITE]: `${REVIEWED_REWRITE}\n// edited` },
    [rewriteAdmission(REVIEWED_REWRITE)],
    STATE_BASE
  );
  assertRefused(broken, 'C1', HANDED);
  assert.equal(broken.telemetry.c1Admissions, 0);
});

test('an admitted callee does not admit a changed dependency outside its bundle', () => {
  const result = runAdmitted(
    {
      [REWRITE]: REVIEWED_REWRITE,
      [NORMALIZE]: 'export function normalize(value: number) { return value + 1; }\n',
    },
    [rewriteAdmission(REVIEWED_REWRITE)],
    STATE_BASE
  );
  assert.equal(result.telemetry.c1Admissions, 1);
  assertRefused(result, 'C1', HANDED);
});
