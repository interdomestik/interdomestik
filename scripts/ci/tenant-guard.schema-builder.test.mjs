// Public type exports and foreign references in newly admitted table modules.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILDERS,
  INDEX,
  NEW,
  OLD,
  append,
  initial,
  original,
  refuses,
  scan,
  snapshot,
  table,
} from './tenant-guard-schema-test-support.mjs';
import { kernelAnchorPins } from './tenant-guard/rules-schema-admission.mjs';

test('inferred select and insert aliases for a local table pass in both comparisons', () => {
  const newModule = [
    'export type RateRow = typeof rates.$inferSelect;',
    table(),
    'export type NewRate = typeof rates.$inferInsert;',
  ].join('\n');
  const candidate = append({ [NEW]: newModule });
  for (const base of [initial, candidate]) {
    const result = scan(candidate, { base });
    assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
    assert.deepEqual(result.violations, []);
  }
  assert.deepEqual([...candidate.graph.exportNames(NEW)], ['rates']);
});

for (const alias of [
  "import { users } from './users';\nexport type RateRow = typeof users.$inferSelect;",
  'export type RateRow = typeof missing.$inferSelect;',
  'export type RateRow<T> = typeof rates.$inferSelect;',
  'export type RateRow = typeof rates.$inferSelect<string>;',
  'export type RateRow = typeof rates.id;',
  'export type RateRow = (typeof rates)["$inferSelect"];',
  'export type RateRow = typeof rates.$inferSelect | typeof rates.$inferInsert;',
  'export interface RateRow {}',
  'export enum RateRow { Standard }',
  'export declare const RateRow: object;',
]) {
  test(`new module refuses ${alias.split('\n').at(-1)}`, () => {
    refuses(
      scan(append({ [NEW]: `${table()}${alias}\n` })),
      `candidate: unsupported module statement ${NEW}`
    );
  });
}

for (const existing of ['export type RateRow = {};', 'export const RateRow = 1;']) {
  test(`a new inferred type collides with ${existing} downstream`, () => {
    const changes = {
      [INDEX]: `${original[INDEX]}export * from './competing';\n`,
      'packages/database/src/competing.ts': existing,
    };
    const base = snapshot(changes);
    const candidate = append({
      ...changes,
      [NEW]: `${table()}export type RateRow = typeof rates.$inferSelect;\n`,
    });
    refuses(
      scan(candidate, { anchor: base, base, legacyPins: kernelAnchorPins(base) }),
      `candidate: public export collision ${INDEX}#RateRow`
    );
  });
}

test('a new inferred type cannot replace an existing downstream type', () => {
  const branch = 'packages/database/src/competing.ts';
  const changes = { [INDEX]: `${original[INDEX]}export * from './competing';\n` };
  const base = snapshot({ ...changes, [branch]: 'export type RateRow = {};\n' });
  const candidate = append({
    ...changes,
    [branch]: 'export type Other = {};\n',
    [NEW]: `${table()}export type RateRow = typeof rates.$inferSelect;\n`,
  });
  refuses(
    scan(candidate, { anchor: base, base, legacyPins: kernelAnchorPins(base) }),
    `candidate: public export collision ${INDEX}#RateRow`
  );
});

test('a local inferred type creates no runtime query name', () => {
  const file = 'apps/web/src/query.ts';
  const changes = {
    [file]:
      'const state = { query: { RateRow: 1 } };\nexport const lookup = () => state.query.RateRow;\n',
  };
  const candidate = append({
    ...changes,
    [NEW]: `${table()}export type RateRow = typeof rates.$inferSelect;\n`,
  });
  const result = scan(candidate, { base: snapshot(changes) });
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  assert.deepEqual(result.violations, []);
});

test('inline and table-level foreign keys may use ordinary column names for user and tenant IDs', () => {
  const changes = {
    [OLD]: `${table('users', 'user')}export const tenants = pgTable('tenants', { id: text('id') });\n`,
  };
  const base = snapshot(changes);
  const candidate = append({
    ...changes,
    [NEW]: `import { foreignKey, pgTable, text } from 'drizzle-orm/pg-core';
import { tenants, users } from './users';
export const rates = pgTable('rates', {
  createdBy: text('created_by').references(() => users.id),
  billedTo: text('billed_to'),
}, row => [foreignKey({ name: 'rates_billed_to', columns: [row.billedTo], foreignColumns: [tenants.id] })]);
`,
  });
  const result = scan(candidate, { anchor: base, base, legacyPins: kernelAnchorPins(base) });
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  assert.deepEqual(result.violations, []);
});

for (const [label, contents, reason] of [
  [
    'shadowed builder',
    `${BUILDERS}export const rates = pgTable('rates', { id: text('id') }, pgTable => [pgTable()]);`,
    'shadowed builder',
  ],
  ['side effect', `${table()}rates;`, 'unsupported module statement'],
  [
    'non-Drizzle import',
    `${table()}import { other } from 'unreviewed';`,
    'unreviewed builder import',
  ],
  ...[
    'import("unreviewed")',
    'require("unreviewed")',
    'new Function("return 1")',
    'Function("return 1")',
    'eval("1")',
  ].map(loader => [loader, `${table()}${loader};`, 'forbidden builder loader']),
  [
    'nested global access',
    `${BUILDERS}export const rates = pgTable('rates', { id: text('id').references(() => process.env.VALUE) });`,
    'unproven global access',
  ],
  [
    'relations',
    `${table()}import { relations } from 'drizzle-orm';\nexport const links = relations(rates, () => ({}));`,
    'relations declaration',
  ],
  [
    'mutation of an imported receiver',
    "import { users } from './users';\nexport const rates = users.enableRLS();",
    'unowned builder receiver',
  ],
]) {
  test(`new module refuses ${label}`, () =>
    refuses(scan(append({ [NEW]: contents })), `candidate: ${reason} ${NEW}`));
}
