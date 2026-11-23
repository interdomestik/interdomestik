import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BARREL,
  INDEX,
  NEW,
  NEW_EXPORT,
  append,
  initial,
  refuses,
  scan,
  snapshot,
  table,
} from './tenant-guard-schema-test-support.mjs';

const LOCK = 'pnpm-lock.yaml';
const CONFIG = 'tsconfig.json';
const MANIFEST = 'packages/ui/package.json';
const DB_MANIFEST = 'packages/database/package.json';
const BILLING = 'apps/web/src/billing-rows.ts';
const DRIVER = 'outside/drizzle/pg-core.ts';

// Keep the compiler target outside the scanned roots while changing only the path rule.
test('an already admitted builder cannot be retargeted by a resolver-only PR', () => {
  const changes = { [DRIVER]: 'export const pgTable = 1;\n' };
  const base = append(changes);
  assert.equal(scan(base).schemaAdmission.ok, true);
  const config = 'apps/web/tsconfig.json';
  const before = base.inputs.get(config);
  const candidate = append({
    ...changes,
    [config]: before.replace(
      '"paths": {',
      '"paths": {\n      "drizzle-orm/pg-core": ["../../outside/drizzle/pg-core"],'
    ),
  });
  assert.deepEqual(
    [...candidate.blobs]
      .filter(([file, text]) => base.blobs.get(file) !== text)
      .map(([file]) => file),
    [config]
  );
  assert.equal(
    candidate.graph.resolveSpecifier(NEW, 'drizzle-orm/pg-core').external,
    'drizzle-orm/pg-core'
  );
  refuses(scan(candidate, { base }), 'candidate: builder alias matches drizzle-orm/pg-core');
});

for (const inBase of [false, true]) {
  test(`unrelated package manifest, config and lock changes coexist with admitted builders (base=${inBase})`, () => {
    const manifest = JSON.parse(initial.inputs.get(MANIFEST));
    const config = initial.inputs.get(CONFIG);
    const lock = initial.inputs.get(LOCK);
    const changed = append({
      [MANIFEST]: JSON.stringify({ ...manifest, description: 'fixture package metadata' }),
      [CONFIG]: `${config}\n// unrelated metadata\n`,
      [LOCK]: lock.replace(
        /( {2}typescript@5\.9\.3:\n    resolution:\s*\{\s*integrity: sha512-)[A-Za-z0-9]/u,
        '$1A'
      ),
    });
    assert.ok(changed.inputs.get(LOCK) !== lock);
    const result = scan(changed, { base: inBase ? changed : append() });
    assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
    assert.deepEqual(result.violations, []);
  });
}

const databaseManifestText = initial.inputs.get(DB_MANIFEST);
const databaseManifest = JSON.parse(databaseManifestText);

test('a database test:rls script change coexists with an admitted table', () => {
  const script = databaseManifest.scripts['test:rls'];
  const changed = databaseManifestText.replace(
    JSON.stringify(script),
    JSON.stringify(`${script} test/schema-admission.test.ts`)
  );
  assert.notEqual(changed, databaseManifestText);
  const candidate = append({ [DB_MANIFEST]: changed });
  for (const base of [initial, candidate]) {
    const result = scan(candidate, { base });
    assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
    assert.deepEqual(result.violations, []);
  }
});

for (const [field, value] of [
  ['exports', { ...databaseManifest.exports, './fixture': './src/constants.ts' }],
  ['main', './src/other.ts'],
  ['dependencies', { ...databaseManifest.dependencies, 'drizzle-orm': '^0.45.3' }],
]) {
  test(`a database manifest change to ${field} refuses schema admission`, () => {
    const candidate = append({
      [DB_MANIFEST]: JSON.stringify({ ...databaseManifest, [field]: value }),
    });
    refuses(scan(candidate), `candidate: resolver input changed ${DB_MANIFEST}`);
  });
}

test('an unparseable database manifest refuses schema admission', () => {
  assert.throws(
    () => append({ [DB_MANIFEST]: '{ "name":' }),
    { message: `unparseable package manifest ${DB_MANIFEST}` }
  );
});

test('an admitted table keeps its exact Drizzle lock entries on a resolver-only PR', () => {
  const lock = initial.inputs.get(LOCK);
  const changed = lock.replace(
    /( {2}drizzle-orm@0\.45\.2:\n    resolution:\s*\{\s*integrity: sha512-)[A-Za-z0-9]/u,
    '$1A'
  );
  assert.ok(changed !== lock);
  refuses(
    scan(append({ [LOCK]: changed }), { base: append() }),
    'candidate: unreviewed Drizzle lock resolution'
  );
});

test('a direct re-export of a new table cannot replace a prior star binding', () => {
  const billing = "export * from './invoices';\n";
  const changes = { 'apps/web/src/invoices.ts': 'export const users = 1;' };
  const base = snapshot({ ...changes, [BILLING]: billing });
  const candidate = append({
    ...changes,
    [BILLING]: `${billing}export { rates as users } from '../../../packages/database/src/schema/rates';\n`,
  });
  refuses(scan(candidate, { base }), `candidate: public export origin changed ${BILLING}#users`);
});

for (const binding of ['{ rates }', '*']) {
  test(`an admitted table cannot be shadowed at the database index by export ${binding} without an append`, () => {
    const changes = { 'packages/database/src/other-rates.ts': 'export const rates = 1;\n' };
    const base = append(changes);
    const candidate = append({
      ...changes,
      [INDEX]: `${base.sources.get(INDEX)}\nexport ${binding} from './other-rates';\n`,
    });
    refuses(scan(candidate, { base }), `candidate: public export collision ${INDEX}#rates`);
  });
}

const billingAlias = name =>
  `import { ${name} } from '@interdomestik/database/schema';\nexport const billingRows = ${name};\n`;

test('an unchanged candidate keeps its admitted table and public alias', () => {
  const base = append({ [BILLING]: billingAlias('rates') });
  const result = scan(base, { base });
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  assert.deepEqual(result.violations, []);
});

test('a direct alias of an admitted table cannot change targets without an append', () => {
  const directAlias = name =>
    `import { ${name} } from '../../../packages/database/src/schema/${name}';\n` +
    `export const billingRows = ${name};\n`;
  const base = append({ [BILLING]: directAlias('rates') });
  assert.equal(scan(base).schemaAdmission.ok, true);
  refuses(
    scan(append({ [BILLING]: directAlias('users') }), { base }),
    `candidate: public export table binding changed ${BILLING}#billingRows`
  );
});

for (const [before, after] of [
  ['users', 'accounts'],
  ['accounts', 'users'],
  ['users', 'rates'],
]) {
  test(`exported table alias cannot change from ${before} to ${after}`, () => {
    const base = snapshot({ [BILLING]: billingAlias(before) });
    refuses(
      scan(append({ [BILLING]: billingAlias(after) }), { base }),
      `candidate: public export table binding changed ${BILLING}#billingRows`
    );
  });
}

test('an alias cannot move off a previously admitted table during another append', () => {
  const base = append({ [BILLING]: billingAlias('rates') });
  assert.equal(scan(base).schemaAdmission.ok, true);
  const candidate = snapshot({
    [BARREL]: `${initial.sources.get(BARREL)}${NEW_EXPORT}export * from './later';\n`,
    [NEW]: table(),
    'packages/database/src/schema/later.ts': table('later'),
    [BILLING]: billingAlias('users'),
  });
  refuses(
    scan(candidate, { base }),
    `candidate: public export table binding changed ${BILLING}#billingRows`
  );
});

for (const body of [
  'const q = tx.query; return q[key];',
  'return consume(tx.query);',
  'return { ...tx.query };',
  'const tx = getClient(); return tx["query"];',
]) {
  test(`retained database helper cannot expose an entire query map (${body})`, () => {
    const file = 'packages/database/src/report.ts';
    const code = `export function report(${body.includes('const tx') ? 'key' : 'tx, key'}) { ${body} }\n`;
    const base = snapshot({ [file]: code });
    refuses(
      scan(append({ [file]: `${code}export const changed = 1;\n` }), { base }),
      `candidate: unproven dynamic schema consumer ${file}`
    );
  });
}

test('literal selection from a retained transaction query map remains admitted', () => {
  const changes = {
    'packages/database/src/report.ts':
      "import { db } from './db';\n" +
      'export const report = () => db.transaction(tx => tx["query"]["users"]);\n',
  };
  const result = scan(append(changes), { base: snapshot(changes) });
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
});

for (const [name, contents] of [
  ['database.cjs', "module.exports = require('@interdomestik/database');"],
  ['database.test.cjs', "module.exports = require('@interdomestik/database');"],
  ['schema.cjs', "exports.rows = require('../../packages/database/src/schema').users;"],
  [
    'alias.ts',
    "import { users } from '@interdomestik/database/schema'; const rows = users; export { rows };",
  ],
  ['intermediary.cjs', "exports.rows = require('./src/schema-forward').users;"],
]) {
  test(`outside-root loader/export cannot forward new schema bindings (${name})`, () => {
    const file = `apps/web/${name}`;
    refuses(
      scan(
        append({
          [file]: contents,
          'apps/web/src/schema-forward.ts': "export * from '@interdomestik/database/schema';\n",
        })
      ),
      `candidate: schema forward outside scan roots ${file}`
    );
  });
}
