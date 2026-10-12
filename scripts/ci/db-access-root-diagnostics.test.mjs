import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const LEAF = 'apps/web/src/diagnostic-leaf.ts';
const TEST_ROOT = 'apps/web/src/diagnostic-leaf.test.ts';
const PAGE = 'apps/web/src/app/diagnostic/page.tsx';

function diagnosticFixture({ productionSource, testRoot = TEST_ROOT }) {
  const root = createTempRepo();
  writeFixture(root, LEAF, 'export const value = "before";');
  writeFixture(
    root,
    testRoot,
    'import {value} from "./diagnostic-leaf"; export const observed = value; export type Fixture = typeof value;'
  );
  if (productionSource) writeFixture(root, PAGE, productionSource);
  sealFixture(root);
  writeFixture(root, LEAF, 'export const value = "after";');
  const result = runGuard(root);
  return { result, report: readReport(root), testRoot };
}

function onlyDiagnostic(report) {
  assert.equal(report.rootDiagnostics.version, 1);
  assert.equal(report.rootDiagnostics.testConsumerRoots.length, 1);
  return report.rootDiagnostics.testConsumerRoots[0];
}

function assertUnprovenDynamicLoader(productionSource) {
  const { result, report } = diagnosticFixture({ productionSource });
  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(onlyDiagnostic(report).classification, 'unproven');
  assert.ok(
    report.rootDiagnostics.analysisUnknowns.some(
      item => item.file === PAGE && item.code === 'unsupported-dynamic-loader'
    )
  );
  return report;
}

test('unchanged test consumers without a proved production path remain unproven', () => {
  const { result, report } = diagnosticFixture({});

  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.status, 'pass');
  assert.equal(report.failingNewCount, 0);
  assert.deepEqual(report.incomplete, []);
  assert.deepEqual(onlyDiagnostic(report), {
    file: TEST_ROOT,
    classification: 'unproven',
    evidence: 'boundedModuleGraph',
  });
  assert.deepEqual(
    report.mountEvidence.roots.map(item => item.file),
    [TEST_ROOT, LEAF]
  );
});

test('static, side-effect and literal dynamic module targets diagnose production reachability', () => {
  for (const productionSource of [
    'export {observed} from "../../diagnostic-leaf.test";',
    'import "../../diagnostic-leaf.test"; export default function Page(){return null;}',
    'export default async function Page(){await import("../../diagnostic-leaf.test");return null;}',
  ]) {
    const { result, report } = diagnosticFixture({ productionSource });
    assert.equal(result.status, 0, JSON.stringify(report));
    assert.deepEqual(onlyDiagnostic(report), {
      file: TEST_ROOT,
      classification: 'production-reachable',
      witnessPath: [PAGE, TEST_ROOT],
    });
  }
});

test('erased type-only targets do not counterfeit proved production reachability', () => {
  const { result, report } = diagnosticFixture({
    productionSource:
      'import type {Fixture} from "../../diagnostic-leaf.test"; export default function Page(){return null;}',
  });

  assert.equal(result.status, 0, JSON.stringify(report));
  assert.deepEqual(onlyDiagnostic(report), {
    file: TEST_ROOT,
    classification: 'unproven',
    evidence: 'boundedModuleGraph',
  });
});

test('unknown production loaders and unresolved local targets diagnose unproven without verdict drift', () => {
  for (const [source, reason] of [
    [
      'const target="../../diagnostic-leaf.test";export default async function Page(){await import(target);return null;}',
      'nonliteral-dynamic-import',
    ],
    [
      'const target="../../diagnostic-leaf.test";export default function Page(){return require(target);}',
      'unsupported-dynamic-loader',
    ],
    [
      'const target="../../diagnostic-leaf.test";export default function Page(){return createRequire(import.meta.url)(target);}',
      'unsupported-dynamic-loader',
    ],
    [
      'import {missing} from "../../missing-module";export default function Page(){return missing;}',
      'unresolved-runtime-module',
    ],
  ]) {
    const { result, report } = diagnosticFixture({ productionSource: source });
    assert.equal(result.status, 0, JSON.stringify(report));
    assert.equal(report.status, 'pass');
    const diagnostic = onlyDiagnostic(report);
    assert.equal(diagnostic.classification, 'unproven');
    assert.equal(diagnostic.evidence, 'analysisUnknowns');
    assert.ok(
      report.rootDiagnostics.analysisUnknowns.some(
        item => item.file === PAGE && item.code === reason
      )
    );
  }
});

test('production-reachable unknowns in test helpers and camouflaged loaders stay unproven', () => {
  const helper = 'apps/web/src/diagnostic-loader.test.ts';
  {
    const root = createTempRepo();
    writeFixture(root, LEAF, 'export const value = "before";');
    writeFixture(
      root,
      TEST_ROOT,
      'import {value} from "./diagnostic-leaf"; export const observed = value;'
    );
    writeFixture(
      root,
      helper,
      'const target="./diagnostic-leaf.test";export async function load(){return import(target);}'
    );
    writeFixture(
      root,
      PAGE,
      'import {load} from "../../diagnostic-loader.test";export default function Page(){return load();}'
    );
    sealFixture(root);
    writeFixture(root, LEAF, 'export const value = "after";');
    const result = runGuard(root);
    const report = readReport(root);

    assert.equal(result.status, 0, JSON.stringify(report));
    assert.equal(onlyDiagnostic(report).classification, 'unproven');
    assert.ok(
      report.rootDiagnostics.analysisUnknowns.some(
        item => item.file === helper && item.code === 'nonliteral-dynamic-import'
      )
    );
  }

  for (const productionSource of [
    'const target="../../diagnostic-leaf.test";const load=require;export default function Page(){return load(target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){return globalThis["require"](target);}',
    'import target=require("../../diagnostic-leaf.test");export default function Page(){return target;}',
    'import {createRequire as make} from "node:module";const target="../../diagnostic-leaf.test";const load=make(import.meta.url);export default function Page(){return load(target);}',
  ]) {
    assertUnprovenDynamicLoader(productionSource);
  }
});

test('computed and reflected loader spellings stay unproven without verdict drift', () => {
  for (const productionSource of [
    'const target="../../diagnostic-leaf.test";export default function Page(){const key="req"+"uire";return globalThis[key](target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){const suffix="uire";return globalThis[`req${suffix}`](target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){const key="req"+"uire";const load=Reflect.get(globalThis,key);return load(target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){const key="e"+"val";return window[key](target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){const key="e"+"val";return self[key](target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){const key="e"+"val";return frames[key](target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){const key="e"+"val";return parent[key](target);}',
    'const target="../../diagnostic-leaf.test";export default function Page(){const key="e"+"val";return top[key](target);}',
  ]) {
    const report = assertUnprovenDynamicLoader(productionSource);
    assert.equal(report.status, 'pass');
    assert.equal(report.failingNewCount, 0);
    assert.deepEqual(report.incomplete, []);
  }
});

test('aliases, casts and shadowed browser names never certify disconnection', () => {
  for (const productionSource of [
    'const host=window;const key="e"+"val";export default function Page(){return host[key]("../../diagnostic-leaf.test");}',
    'const key="e"+"val";export default function Page(){return (window as any)[key]("../../diagnostic-leaf.test");}',
    'const key="e"+"val";export default function Page(){return Reflect.get(window as any,key)("../../diagnostic-leaf.test");}',
    'const parent={value:1};const key="value";export default function Page(){return parent[key];}',
  ]) {
    const { result, report } = diagnosticFixture({ productionSource });
    assert.equal(result.status, 0, JSON.stringify(report));
    assert.equal(report.status, 'pass');
    assert.deepEqual(report.incomplete, []);
    assert.equal(onlyDiagnostic(report).classification, 'unproven');
  }
});

test('lexically shadowed loader names do not add unsupported-loader evidence', () => {
  const { result, report } = diagnosticFixture({
    productionSource: [
      'const Function=1;',
      'const require=(value)=>value;',
      'const createRequire=()=>()=>null;',
      'export default function Page(){return [Function,require("safe"),createRequire()()];}',
    ].join(''),
  });

  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.rootDiagnostics.analysisUnknowns, []);
  assert.deepEqual(onlyDiagnostic(report), {
    file: TEST_ROOT,
    classification: 'unproven',
    evidence: 'boundedModuleGraph',
  });
});

test('test-like filenames only add diagnostics and never demote an existing guard verdict', () => {
  const outcomes = [];
  for (const [testRoot, expectedDiagnostic] of [
    ['apps/web/src/diagnostic-consumer.ts', false],
    ['apps/web/src/diagnostic-consumer.test.ts', true],
    ['apps/web/src/diagnostic-consumer.spec.ts', true],
    ['apps/web/src/diagnostic-consumer.e2e.ts', true],
    ['apps/web/src/__tests__/diagnostic-consumer.ts', true],
    ['apps/web/src/__mocks__/diagnostic-consumer.ts', true],
    ['apps/web/src/test/diagnostic-consumer.ts', true],
    ['apps/web/src/tests/diagnostic-consumer.ts', true],
    ['apps/web/src/e2e/diagnostic-consumer.ts', true],
  ]) {
    const root = createTempRepo();
    writeFixture(root, LEAF, [
      'import {db} from "@interdomestik/database";',
      'export function read(){return db.select();}',
    ]);
    writeFixture(
      root,
      testRoot,
      `import {read} from ${JSON.stringify(
        testRoot.startsWith('apps/web/src/diagnostic-consumer')
          ? './diagnostic-leaf'
          : '../diagnostic-leaf'
      )};export function consume(){return read();}`
    );
    sealFixture(root);
    writeFixture(root, LEAF, [
      'import {db} from "@interdomestik/database";',
      'export function read(){return db.select();}',
      'export const display = "changed";',
    ]);
    const result = runGuard(root);
    const report = readReport(root);
    outcomes.push({
      status: report.status,
      exit: result.status,
      failingNewCount: report.failingNewCount,
      incompleteRawCount: report.incompleteRawCount,
    });
    assert.equal(report.rootDiagnostics.testConsumerRoots.length, expectedDiagnostic ? 1 : 0);
  }

  assert.equal(
    new Set(outcomes.map(item => JSON.stringify(item))).size,
    1,
    JSON.stringify(outcomes)
  );
  assert.notEqual(outcomes[0].status, 'pass');
  assert.equal(outcomes[0].exit, 1);
});
