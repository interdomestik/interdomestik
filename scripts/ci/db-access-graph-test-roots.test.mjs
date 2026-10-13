import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  scan,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const helper = 'apps/web/src/lib/claims.test-support.ts';
const mockHeavy = [
  'import {vi, expect, it} from "vitest";',
  'import {db} from "@interdomestik/database";',
  'const mocks = vi.hoisted(() => ({select: vi.fn(), insert: vi.fn(), session: vi.fn()}));',
  'vi.mock("@interdomestik/database", () => ({db: {select: mocks.select, insert: mocks.insert}}));',
  'vi.mock("@/lib/session", () => ({getSession: mocks.session}));',
  'const mockDb = {select: vi.fn(() => ({from: vi.fn(() => [])})), transaction: vi.fn()};',
  'export function arrange(){mocks.select.mockReturnValue({from: () => []});vi.mocked(db.select);}',
  'it("reads", async () => {arrange();mockDb.select().from();await mockDb.transaction(async (tx:any) => tx.update());expect(mocks.insert).not.toHaveBeenCalled();});',
];

test('benign changed mock-heavy test module is not a product root', () => {
  const { result, report } = scan(mockHeavy, 'apps/web/src/actions/claims.test.ts');
  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.incomplete, []);
  assert.deepEqual(report.failingNewEntries, []);
});

test('changed test-only helper fails on its own canonical DB operation without graph incompletes', () => {
  const { result, report } = scan(
    [...mockHeavy, 'export function seed(){return db.insert(claims).values({});}'].map(line =>
      line.startsWith('vi.mock("@interdomestik/database"') ? '' : line
    ),
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
