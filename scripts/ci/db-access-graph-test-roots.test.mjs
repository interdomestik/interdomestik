import assert from 'node:assert/strict';
import test from 'node:test';
import { testOnlySource } from './db-access-graph.mjs';
import { scan } from './db-access-guard-test-utils.mjs';
import { CANONICAL, rejectedTestOnly } from './db-access-graph-test-roots-utils.mjs';

const helper = 'apps/web/src/lib/claims.test-support.ts';
// Source-proved non-DB receivers only: zero-argument const Set/Map collections.
const collectionControl = [
  'const seen = new Set();',
  'const index = new Map();',
  'export function reset(){seen.delete(1);index.delete("a");}',
];
// Test-runner framework and spies with no DB-looking receiver; its unknown executable edges
// may leave the proof incomplete, but nothing in it is a failing DB operation.
const frameworkRunner = [
  'import {describe, expect, it, vi} from "vitest";',
  'const notify = vi.fn();',
  'const clock = {now: vi.fn(() => 0)};',
  'vi.spyOn(clock, "now").mockReturnValue(1);',
  'export function arrange(){notify.mockClear();}',
  'describe("format", () => {it("formats", () => {arrange();notify("x");expect(notify).toHaveBeenCalledWith("x");expect(clock.now()).toBe(1);});});',
];
// DB-looking mocks stay unsafe until a separate source-proved precision correction exists.
const dbLookingMocks = [
  'import {vi, expect, it} from "vitest";',
  'const mocks = vi.hoisted(() => ({select: vi.fn(), insert: vi.fn(), session: vi.fn()}));',
  'vi.mock("@interdomestik/database", () => ({db: {select: mocks.select, insert: mocks.insert}}));',
  'vi.mock("@/lib/session", () => ({getSession: mocks.session}));',
  'const mockDb = {select: vi.fn(() => ({from: vi.fn(() => [])})), transaction: vi.fn()};',
  'export function arrange(){mocks.select.mockReturnValue({from: () => []});}',
  'it("reads", async () => {arrange();mockDb.select().from();await mockDb.transaction(async (tx:any) => tx.update());expect(mocks.insert).not.toHaveBeenCalled();});',
];

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

test('changed test module with only source-proved non-DB Set/Map receivers passes', () => {
  const { result, report } = scan(collectionControl, 'apps/web/src/lib/cache.test.ts');
  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.incomplete, []);
  assert.deepEqual(report.failingNewEntries, []);
});

test('framework spies without DB-looking receivers may be incomplete but never fail', () => {
  const { report } = scan(frameworkRunner, 'apps/web/src/actions/claims.test.ts');
  assert.notEqual(report.status, 'fail', JSON.stringify(report));
  assert.deepEqual(report.failingNewEntries, []);
});

test('changed test module with DB-looking mock receivers is rejected, not exempt by filename', () => {
  const file = 'apps/web/src/actions/claims.test.ts';
  const report = rejectedTestOnly(file, dbLookingMocks);
  for (const callee of ['mockDb.select', 'mockDb.transaction', 'tx.update'])
    assert.ok(
      report.failingNewEntries.some(item => item.file === file && item.callee === callee),
      callee
    );
});

test('changed test-only helper fails on its own canonical DB operation', () => {
  const report = rejectedTestOnly(helper, [
    ...collectionControl,
    CANONICAL,
    'export function seed(){return db.insert(claims).values({});}',
  ]);
  assert.deepEqual(
    report.failingNewEntries.map(item => [item.file, item.callee]),
    [[helper, 'db.insert']]
  );
  assert.ok(report.failingNewEntries[0].mountedFromAll.includes(helper));
});

for (const [label, lines] of [
  ['computed member', [CANONICAL, 'export async function run(){return db["select"]();}']],
  [
    'computed query table',
    [CANONICAL, 'export async function run(){return db.query["user"].findFirst();}'],
  ],
  [
    'extracted method invocation',
    [CANONICAL, 'export async function run(){const select = db.select;return select();}'],
  ],
  [
    'escaped helper argument',
    [
      CANONICAL,
      'function helper(client:any){return client.select();}',
      'export async function run(){return helper(db);}',
    ],
  ],
  [
    'Reflect.apply',
    [CANONICAL, 'export async function run(){return Reflect.apply(db.select, db, []);}'],
  ],
  [
    'destructuring',
    [CANONICAL, 'export async function run(){const {select} = db;return select();}'],
  ],
  ['tagged execute', [CANONICAL, 'export async function run(){return db.execute`select 1`;}']],
  [
    'renamed alias',
    [
      'import {db as client, claims} from "@interdomestik/database";',
      'export async function run(){return client.delete(claims);}',
    ],
  ],
  [
    'mocking reference is not source-proved inert',
    [CANONICAL, 'import {vi} from "vitest";', 'vi.mocked(db.select).mockReturnValue([] as any);'],
  ],
])
  test(`changed test-only module fails closed on ambient client use: ${label}`, () => {
    rejectedTestOnly('apps/web/src/lib/ambient.test.ts', lines);
  });
