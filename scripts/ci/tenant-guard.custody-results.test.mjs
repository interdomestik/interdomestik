import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRefused, runWithBase } from './tenant-guard-test-support.mjs';

// ---- Q5: an operator result holds the schema value it was given --------------------------------

const RESULT_BASE = {
  'packages/database/src/db.ts': [
    "import { claims } from './schema';",
    'export const db: any = {};',
    'export const dbAdmin: any = {};',
    'export const dbRls: any = { claims };',
  ].join('\n'),
  'packages/database/src/schema.ts':
    "export const users = {};\nexport const claims = { id: 'id', status: 'status' };\n",
  'apps/web/src/legacy-read.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "export function read() { return withTenantContext({ tenantId: 'tenant-A' }, tx => tx.select()); }",
  ].join('\n'),
};
const IMPORTS = [
  "import { aliasedTable, and, eq, sql } from 'drizzle-orm';",
  "import { claims } from '@interdomestik/database';",
  "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
];
const resultRun = lines =>
  runWithBase(RESULT_BASE, { 'apps/web/src/conditions.ts': [...IMPORTS, ...lines].join('\n') });
const inFunction = body => ['export function attack(input: any) {', ...body, '}'];

test('Q5: member extraction or mutation of an operator result is refused', () => {
  const cases = {
    exact: [
      /#claims .* is given to eq whose result is read through \(eq\(claims.id, 'x'\).queryChunks\)/u,
      ...inFunction(["  (eq(claims.id, 'x').queryChunks[1] as any).name = 'other';"]),
    ],
    alias: [
      /#claims .* is given to eq whose result is held by c, which is read through \(c.queryChunks\)/u,
      ...inFunction([
        "  const c: any = and(eq(claims.id, 'x'), eq(claims.status, 'open'));",
        "  c.queryChunks[0].queryChunks[1].name = 'other';",
      ]),
    ],
    taggedTemplate: [
      /#claims .* is given to sql whose result is held by chunk, which is read through/u,
      ...inFunction([
        '  const chunk: any = sql`${claims.id} = ${input}`;',
        '  return chunk.queryChunks;',
      ]),
    ],
    aliasMethod: [
      /#claims .* whose result is read through \(\(eq\(claims.id, 'x'\).as\('alias'\) as any\).fieldAlias\)/u,
      ...inFunction(["  return (eq(claims.id, 'x').as('alias') as any).fieldAlias;"]),
    ],
    viaParameter: [
      /#claims .* is passed to condition, which is read through \(condition.queryChunks\)/u,
      "function rename(condition: any) { condition.queryChunks[1].name = 'other'; }",
      ...inFunction(["  rename(eq(claims.id, 'x'));"]),
    ],
    viaReturn: [
      /#claims .* is returned to build\(\), which is read through \(\(build\(\) as any\).queryChunks\)/u,
      "function build() { return eq(claims.id, 'x'); }",
      ...inFunction(["  (build() as any).queryChunks[1].name = 'other';"]),
    ],
    viaContainer: [
      /#claims .* is held by parts, which is read through \(parts\[0\]\)|is held by parts, which escapes/u,
      ...inFunction([
        '  const parts: any[] = [];',
        "  parts.push(eq(claims.id, 'x'));",
        "  parts[0].queryChunks[1].name = 'other';",
      ]),
    ],
    splicedOut: [
      /is spliced into an array whose removed elements are used/u,
      ...inFunction([
        "  const parts: any[] = [eq(claims.status, 'open')];",
        "  return parts.splice(0, 1, eq(claims.id, 'x'));",
      ]),
    ],
    storedArgument: [
      /#claims .* is given to eq whose result is passed to a callee taken from the parameters/u,
      ...inFunction(["  input.keep(and(eq(claims.id, 'x')));"]),
    ],
    optionsKey: [
      /#claims .* is passed to options, which is read through \(options.where.queryChunks\)/u,
      'function peek(options: any) { return options.where.queryChunks; }',
      ...inFunction(["  peek({ where: eq(claims.id, 'x'), limit: 1 });"]),
    ],
    destructuredKey: [
      /is destructured into where, which is read through \(where.queryChunks\)/u,
      "function peek({ where, limit }: any) { where.queryChunks[1].name = 'other'; return limit; }",
      ...inFunction(["  peek({ where: eq(claims.id, 'x'), limit: 1 });"]),
    ],
    tableAliasColumn: [
      /#claims .* is given to aliasedTable whose result is read through \(reviewer.id.name\)|which is read through \(reviewer.id.name\)/u,
      ...inFunction([
        "  const reviewer: any = aliasedTable(claims, 'reviewer');",
        "  reviewer.id.name = 'other';",
      ]),
    ],
    returnedCallback: [
      /#claims .* is returned from a function value/u,
      ...inFunction(["  return [1].map(() => eq(claims.id, 'x'));"]),
    ],
  };
  for (const [name, [pattern, ...lines]] of Object.entries(cases)) {
    const result = resultRun(lines);
    assert.ok(result.violations.length > 0, name);
    assertRefused(result, 'C1', pattern);
  }
});

test('Q5: ordinary condition composition reaching a recognized builder is accepted', () => {
  const result = resultRun([
    'function byStatus(status: string) { return eq(claims.status, status); }',
    'function scoped(where: any, extra: any) { return and(where, extra); }',
    'async function first(executor: any, where: any) {',
    '  return executor.query.claims.findFirst({ where, columns: { id: true } });',
    '}',
    'function page(executor: any, { where, limit }: any) {',
    '  return executor.select().from(claims).where(where).limit(limit);',
    '}',
    'export function read(authority: any, input: any) {',
    '  return withTenantAuthority(authority, async (tx: any) => {',
    '    const conditions = [eq(claims.id, input.id)];',
    '    if (input.status) conditions.push(byStatus(input.status));',
    '    conditions.splice(1, 0, sql`${claims.status} is not null`);',
    '    let filter = sql`TRUE`;',
    '    filter = sql`${claims.id} > ${input.after}`;',
    '    const where = conditions.length > 0 ? and(...conditions) : undefined;',
    '    await tx.select({ total: sql`count(*)`.as("total") }).from(claims).where(and(where, filter));',
    '    await tx.query.claims.findMany({ where: eq(claims.id, input.id) });',
    '    await first(tx, scoped(eq(claims.id, input.id), byStatus("open")));',
    "    const reviewer = aliasedTable(claims, 'reviewer');",
    '    await tx.select({ id: reviewer.id }).from(reviewer).where(eq(reviewer.status, "open"));',
    '    await page(tx, { where: and(where, byStatus("open")), limit: 10 });',
    '    return tx.select().from(claims).where(byStatus(input.status));',
    '  });',
    '}',
  ]);
  assert.deepEqual(result.violations, []);
});
