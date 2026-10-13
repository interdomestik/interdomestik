import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';
import {
  behindUnchangedLoader,
  CANONICAL,
  LOADED_FIXTURE,
  rejectedTestOnly,
} from './db-access-graph-test-roots-utils.mjs';

const helper = 'apps/web/src/lib/claims.test-support.ts';
const effect = 'apps/web/src/lib/effect.test-support.ts';

test('changed test-only side-effect import target fails on its own ambient operation', () => {
  const report = rejectedTestOnly(
    'apps/web/src/lib/ambient.test.ts',
    'import "./effect.test-support";',
    { [effect]: [CANONICAL, 'db["delete"](claims);'] }
  );
  assert.ok(report.failingNewEntries.some(item => item.file === effect));
});

test('unknown operation in a changed test module fails unmounted and keeps the production witness', () => {
  const page = 'apps/web/src/app/page.tsx';
  const unknownOperation = [
    'import {claims} from "@interdomestik/database";',
    'import {getClient} from "external-library";',
    'getClient().delete(claims);',
  ];
  // Unsafe inventory is enforced regardless of whether production mounts the module.
  const unmounted = rejectedTestOnly(effect, unknownOperation);
  assert.ok(
    unmounted.failingNewEntries.some(
      item => item.file === effect && item.callee === 'getClient().delete'
    ),
    JSON.stringify(unmounted)
  );
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
      item =>
        item.file === effect &&
        item.callee === 'getClient().delete' &&
        item.mountedFromAll?.includes(page)
    ),
    JSON.stringify(report)
  );
});

for (const [label, lines, callee] of [
  [
    'canonical computed delete',
    [CANONICAL, 'export default function run(){return db["delete"](claims);}'],
    undefined,
  ],
  [
    'external drizzle/pg client (reviewer counterexample)',
    [
      'import {claims} from "@interdomestik/database";',
      'import {drizzle} from "drizzle-orm/node-postgres";',
      'import {Pool} from "pg";',
      'const c = drizzle(new Pool({connectionString: process.env.OTHER_URL}));',
      'export default () => c.delete(claims);',
    ],
    'c.delete',
  ],
  [
    'renamed external client alias',
    [
      'import {claims} from "@interdomestik/database";',
      'import {drizzle as connect} from "drizzle-orm/node-postgres";',
      'import {Pool as Pg} from "pg";',
      'const client = connect(new Pg({connectionString: process.env.OTHER_URL}));',
      'const alias = client;',
      'export default () => alias.delete(claims);',
    ],
    'alias.delete',
  ],
  [
    'unknown external getClient',
    ['import {getClient} from "external-library";', 'export default () => getClient().select();'],
    'getClient().select',
  ],
])
  test(`new test-named module behind an unchanged computed loader fails: ${label}`, () => {
    const report = behindUnchangedLoader(lines);
    assert.ok(
      report.failingNewEntries.some(
        item =>
          item.file === LOADED_FIXTURE &&
          (callee === undefined || item.callee === callee) &&
          item.mountedFromAll?.includes(LOADED_FIXTURE)
      ),
      JSON.stringify(report)
    );
  });

// These unknown executable edges never become inventory entries; only the graph walk of the
// changed test-named root keeps them fail-closed.
for (const [label, body] of [
  ['computed unknown member', 'export default () => getClient()["select"]();'],
  [
    'destructured unknown method',
    'export default () => {const {select} = getClient();return select();};',
  ],
])
  test(`new test-named module behind an unchanged computed loader is incomplete: ${label}`, () => {
    const report = behindUnchangedLoader(['import {getClient} from "external-library";', body]);
    assert.ok(
      report.incomplete.some(item => item.file === LOADED_FIXTURE),
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
