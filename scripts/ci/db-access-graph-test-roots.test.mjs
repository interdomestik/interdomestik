import assert from 'node:assert/strict';
import test from 'node:test';
import { testOnlySource } from './db-access-graph.mjs';
import {
  createTempRepo,
  readReport,
  runGuard,
  scan,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const helper = 'apps/web/src/lib/claims.test-support.ts';
const canonical = 'import {db, claims} from "@interdomestik/database";';
// No ambient client identity: only module mocks, vi.fn doubles and DB-named local objects.
const mockHeavy = [
  'import {vi, expect, it} from "vitest";',
  'const mocks = vi.hoisted(() => ({select: vi.fn(), insert: vi.fn(), session: vi.fn()}));',
  'vi.mock("@interdomestik/database", () => ({db: {select: mocks.select, insert: mocks.insert}}));',
  'vi.mock("@/lib/session", () => ({getSession: mocks.session}));',
  'const mockDb = {select: vi.fn(() => ({from: vi.fn(() => [])})), transaction: vi.fn()};',
  'export function arrange(){mocks.select.mockReturnValue({from: () => []});}',
  'it("reads", async () => {arrange();mockDb.select().from();await mockDb.transaction(async (tx:any) => tx.update());expect(mocks.insert).not.toHaveBeenCalled();});',
];

// Only graph.failures can fail a test-only file the product does not reach, so every failing
// entry below is the direct ambient-client rule rather than a mock-driven graph incomplete.
function rejectedTestOnly(file, lines, extra = {}) {
  const root = createTempRepo();
  for (const [other, body] of Object.entries(extra)) writeFixture(root, other, body);
  writeFixture(root, file, lines);
  const result = runGuard(root);
  const report = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.notEqual(report.status, 'pass');
  const failing = report.failingNewEntries.filter(item => testOnlyFile(item.file));
  assert.ok(failing.length > 0, JSON.stringify(report));
  for (const item of failing) assert.deepEqual(item.mountedFromAll, [item.file]);
  return report;
}
const testOnlyFile = file => /\.test(?:-support)?\.ts$/u.test(file);

// Frozen copy of the original single-regex recognizer; testOnlySource must match it exactly.
const frozenTestOnlySource = file =>
  /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)[^/]*(?:[.-]fixture|[.-]test-support|[.-]test-helpers)\.[cm]?[jt]sx?$/u.test(
    file
  );

test('testOnlySource split recognizers match the frozen original regex', () => {
  const dirs = ['', 'a/', 'apps/web/src/', '__tests__/', 'x__tests__/', 'a/__tests__/'];
  const stems = [
    'x',
    'x.test',
    'x.spec',
    'x-test',
    'x.tests',
    'x.fixture',
    'x-fixture',
    'x_fixture',
    'xfixture',
    '.fixture',
    '-fixture',
    'x.test-support',
    'x-test-support',
    'x.test-helpers',
    'x-test-helpers',
    'x.test-helper',
    'x.fixtures',
    'x.fixture.d',
    'x.test.fixture',
    'fixture',
    'test-support',
    'x.test/support',
    'x.fixture/y',
  ];
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
  extensions.push('.json', '.mtsx', '.tsx.map', '.ts\n');
  let matched = 0;
  for (const dir of dirs)
    for (const stem of stems)
      for (const extension of extensions) {
        const file = `${dir}${stem}${extension}`;
        const expected = frozenTestOnlySource(file);
        if (expected) matched += 1;
        assert.equal(testOnlySource(file), expected, JSON.stringify(file));
      }
  assert.ok(matched > 50, `parity corpus must include matching paths, got ${matched}`);
});

test('benign changed mock-heavy test module is not a product root', () => {
  const { result, report } = scan(mockHeavy, 'apps/web/src/actions/claims.test.ts');
  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.incomplete, []);
  assert.deepEqual(report.failingNewEntries, []);
});

test('changed test-only helper fails on its own canonical DB operation without graph incompletes', () => {
  const { result, report } = scan(
    [...mockHeavy, canonical, 'export function seed(){return db.insert(claims).values({});}'],
    helper
  );
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.equal(report.status, 'fail');
  assert.deepEqual(report.incomplete, []);
  assert.deepEqual(
    report.failingNewEntries.map(item => [item.file, item.callee, item.mountedFromAll]),
    [[helper, 'db.insert', [helper]]]
  );
});

for (const [label, lines] of [
  ['computed member', [canonical, 'export async function run(){return db["select"]();}']],
  [
    'computed query table',
    [canonical, 'export async function run(){return db.query["user"].findFirst();}'],
  ],
  [
    'extracted method invocation',
    [canonical, 'export async function run(){const select = db.select;return select();}'],
  ],
  [
    'escaped helper argument',
    [
      canonical,
      'function helper(client:any){return client.select();}',
      'export async function run(){return helper(db);}',
    ],
  ],
  [
    'Reflect.apply',
    [canonical, 'export async function run(){return Reflect.apply(db.select, db, []);}'],
  ],
  [
    'destructuring',
    [canonical, 'export async function run(){const {select} = db;return select();}'],
  ],
  ['tagged execute', [canonical, 'export async function run(){return db.execute`select 1`;}']],
  [
    'renamed alias',
    [
      'import {db as client, claims} from "@interdomestik/database";',
      'export async function run(){return client.delete(claims);}',
    ],
  ],
  [
    'mocking reference is not source-proved inert',
    [canonical, 'import {vi} from "vitest";', 'vi.mocked(db.select).mockReturnValue([] as any);'],
  ],
])
  test(`changed test-only module fails closed on ambient client use: ${label}`, () => {
    rejectedTestOnly('apps/web/src/lib/ambient.test.ts', lines);
  });

test('changed test-only side-effect import target fails on its own ambient operation', () => {
  const effect = 'apps/web/src/lib/effect.test-support.ts';
  const report = rejectedTestOnly(
    'apps/web/src/lib/ambient.test.ts',
    'import "./effect.test-support";',
    { [effect]: [canonical, 'db["delete"](claims);'] }
  );
  assert.ok(report.failingNewEntries.some(item => item.file === effect));
});

test('production side-effect import makes a changed test module product-reachable', () => {
  const effect = 'apps/web/src/lib/effect.test-support.ts';
  const page = 'apps/web/src/app/page.tsx';
  const unknownOperation = [
    'import {claims} from "@interdomestik/database";',
    'import {getClient} from "external-library";',
    'getClient().delete(claims);',
  ];
  // Control: the same non-ambient operation in an unmounted test module is not a product root.
  const { result: control, report: unmounted } = scan(unknownOperation, effect);
  assert.equal(control.status, 0, JSON.stringify(unmounted));
  const root = createTempRepo();
  writeFixture(root, effect, 'export {};');
  writeFixture(root, page, [
    'import "../lib/effect.test-support";',
    'export default function Page(){return null;}',
  ]);
  sealFixture(root);
  writeFixture(root, effect, unknownOperation);
  const result = runGuard(root);
  const report = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.ok(
    report.failingNewEntries.some(
      item => item.file === effect && item.callee === 'getClient().delete'
    ),
    JSON.stringify(report)
  );
});

test('test-named module behind an unchanged computed loader still fails on ambient use', () => {
  // Existing root contract: an unchanged computed loader is diagnostic-only (no verdict drift).
  // The loaded test-named module cannot rely on that to hide an ambient operation.
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    'export default async function Page({name}:{name:string}){',
    '  return (await import(`../lib/handlers/${name}`)).default();',
    '}',
  ]);
  sealFixture(root);
  const fixture = 'apps/web/src/lib/handlers/x-fixture.ts';
  writeFixture(root, fixture, [
    canonical,
    'export default function run(){return db["delete"](claims);}',
  ]);
  const result = runGuard(root);
  const report = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.notEqual(report.status, 'pass');
  assert.ok(
    report.failingNewEntries.some(
      item => item.file === fixture && item.mountedFromAll?.includes(fixture)
    ),
    JSON.stringify(report)
  );
});

test('unchanged production importer of a changed test-named helper is invalidated and traversed', () => {
  const root = createTempRepo();
  writeFixture(root, helper, 'export function seed(x:any){return x;}');
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    `import {seed} from "${helper.replace('apps/web/src/', '@/').replace(/\.ts$/u, '')}";`,
    'export default function Page(){return seed(1);}',
  ]);
  sealFixture(root);
  for (const [body, unknown] of [
    [
      'import {db} from "@interdomestik/database";export function seed(x:any){return db.select();}',
      false,
    ],
    [
      'import {getClient} from "external-library";export function seed(x:any){return getClient().select();}',
      true,
    ],
  ]) {
    writeFixture(root, helper, body);
    const result = runGuard(root);
    const report = readReport(root);
    assert.equal(result.status, 1, JSON.stringify(report));
    assert.notEqual(report.status, 'pass');
    assert.deepEqual(
      report.mountEvidence.roots.map(item => [item.file, item.changeKind]),
      [
        ['apps/web/src/app/page.tsx', 'runtime-consumer'],
        [helper, 'runtime-source'],
      ]
    );
    if (unknown)
      assert.ok(report.incomplete.some(item => item.file === 'apps/web/src/app/page.tsx'));
    else
      assert.ok(
        report.failingNewEntries.some(
          item =>
            item.callee === 'db.select' &&
            item.mountedFromAll?.includes('apps/web/src/app/page.tsx')
        ),
        JSON.stringify(report)
      );
  }
});
