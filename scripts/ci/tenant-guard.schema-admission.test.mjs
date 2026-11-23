// Tenant guard S2 contract tests for additive schema admission and exact fallback.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BARREL,
  DB,
  INDEX,
  LIFETIME,
  NEW,
  NEW_EXPORT,
  OLD,
  SCHEMA,
  TENANT,
  append,
  initial,
  original,
  refuses,
  scan,
  snapshot,
  table,
} from './tenant-guard-schema-test-support.mjs';
import { kernelAnchorPins } from './tenant-guard/rules-schema-admission.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import { schemaTreeFromBlobs } from './tenant-guard/sources.mjs';

test('the same-source protected comparison succeeds before and after a tail append', () => {
  for (const candidate of [initial, append()]) {
    const result = scan(candidate);
    assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
    assert.deepEqual(result.violations, []);
    assert.ok(result.telemetry.legacyAccepted > 0);
    const exact = evaluate({
      sources: candidate.sources,
      graph: candidate.graph,
      trusted: new Map(),
      contracts: [],
      legacyPins: null,
    });
    assert.deepEqual(result.pinnedModules, exact.pinnedModules);
    assert.deepEqual(result.legacyExactDigests, exact.legacyDigests);
  }
  const after = scan(append());
  assert.ok(after.pinnedModules.includes(NEW));
  assert.ok(after.tenantState.includes(`${NEW}#rates`));
});

for (const role of ['anchor', 'base']) {
  test(`missing ${role} snapshot`, () =>
    refuses(scan(append(), { [role]: null }), `missing ${role} input`));
  test(`empty ${role} snapshot`, () =>
    refuses(
      scan(append(), { [role]: schemaTreeFromBlobs(new Map()) }),
      `${role}: missing barrel ${BARREL}`
    ));
  for (const [label, contents, defect] of [
    ['missing', null, 'missing barrel'],
    ['empty', '', 'empty barrel'],
    ['unparseable', 'export * from ;', 'unparseable barrel'],
    ['comments only', '// no exports\n', 'no runtime exports in barrel'],
    ['empty export', 'export {};\n', 'no runtime exports in barrel'],
  ]) {
    test(`${role} with ${label} barrel`, () =>
      refuses(
        scan(append(), { [role]: snapshot({ [BARREL]: contents }) }),
        `${role}: ${defect} ${BARREL}`
      ));
  }
  for (const [label, contents, defect] of [
    ['missing', null, 'missing entry'],
    ['empty', '', 'empty entry'],
    ['unparseable', 'export const = ;', 'unparseable entry'],
    ['type only', 'export type DB = object;', 'no runtime exports in entry'],
  ]) {
    test(`${role} with ${label} legacy entry`, () =>
      refuses(
        scan(append(), { [role]: snapshot({ [DB]: contents }) }),
        `${role}: ${defect} ${DB}`
      ));
  }
}

for (const [label, contents, defect] of [
  ['missing', null, 'missing new module'],
  ['empty', '', 'empty new module'],
  ['unparseable', 'export const broken = ;', 'unparseable new module'],
  ['type only', 'export type Rates = object;', 'no runtime exports in new module'],
  ['empty export', 'export {};', 'no runtime exports in new module'],
]) {
  test(`new module ${label} is refused`, () =>
    refuses(scan(append({ [NEW]: contents })), `candidate: ${defect} ${NEW}`));
}

test('missing candidate entry is reported even when the legacy pin reporter has no node', () => {
  const candidate = append({ [DB]: null });
  const result = scan(candidate);
  refuses(result, `candidate: missing entry ${DB}`, { c1: false });
  const exact = evaluate({
    sources: candidate.sources,
    graph: candidate.graph,
    trusted: initial.sources,
    contracts: [],
    legacyPins: null,
  });
  assert.deepEqual(result.pinnedModules, exact.pinnedModules);
});

for (const file of [DB, TENANT, LIFETIME, OLD]) {
  test(`one byte of existing kernel drift in ${file}`, () => {
    refuses(
      scan(append({ [file]: `${original[file]} ` })),
      `candidate: changed kernel module ${file}`
    );
  });
}

test('the next protected base byte-binds the previously admitted table', () => {
  const base = append();
  assert.equal(scan(base).schemaAdmission.ok, true);
  refuses(
    scan(append({ [NEW]: `${table()} ` }), { base }),
    `candidate: changed kernel module ${NEW}`
  );
});

for (const [label, barrel] of [
  ['removal with target still reached by accounts', "export * from './accounts';\n"],
  ['reorder', "export * from './accounts';\nexport * from './users';\n"],
  ['mid-barrel addition', `${NEW_EXPORT}${original[BARREL]}`],
]) {
  test(`barrel ${label}`, () =>
    refuses(
      scan(append({ [BARREL]: barrel })),
      'candidate: barrel is not a byte-identical prefix'
    ));
}

test('an appended namespace re-export is refused', () => {
  refuses(
    scan(append({ [BARREL]: `${original[BARREL]}export * as rates from './rates';\n` })),
    'candidate: unsupported appended barrel export'
  );
});

test('two new modules cannot contribute the same binding', () => {
  refuses(
    scan(
      append({
        [BARREL]: `${original[BARREL]}${NEW_EXPORT}export * from './more-rates';\n`,
        'packages/database/src/schema/more-rates.ts': table('rates', 'more_rates'),
      })
    ),
    `candidate: public export collision ${BARREL}#rates`
  );
});

for (const layer of [SCHEMA, INDEX]) {
  test(`a new binding collides only downstream at ${layer}`, () => {
    const changes = {
      [layer]: `${original[layer]}export * from './competing';\n`,
      'packages/database/src/competing.ts': 'export const rates = 1;\n',
    };
    const base = snapshot(changes);
    refuses(
      scan(append(changes), { anchor: base, base, legacyPins: kernelAnchorPins(base) }),
      `candidate: public export collision ${layer}#rates`
    );
  });
}

test('the existing table physical name is reserved', () => {
  refuses(
    scan(append({ [NEW]: table('rates', 'users') })),
    'candidate: duplicate database identity public.users'
  );
});

test('the existing view physical name is reserved', () => {
  const view =
    `${original[OLD]}import { pgView } from 'drizzle-orm/pg-core';\n` +
    "export const report = pgView('report', {}).existing();\n";
  const base = snapshot({ [OLD]: view });
  refuses(
    scan(append({ [OLD]: view, [NEW]: table('rates', 'report') }), {
      anchor: base,
      base,
      legacyPins: kernelAnchorPins(base),
    }),
    'candidate: duplicate database identity public.report'
  );
});

test('a parallel declaration file is an ambiguous resolver candidate', () => {
  refuses(
    scan(append({ [NEW.replace(/\.ts$/u, '.d.ts')]: 'export declare const rates: object;\n' })),
    `candidate: ambiguous appended target ${NEW}`
  );
});

test('a type export cannot be replaced by a new downstream table binding', () => {
  const branch = 'packages/database/src/competing.ts';
  const changes = {
    [INDEX]: `${original[INDEX]}export * from './competing';\n`,
    [branch]: 'export type rates = {};\n',
  };
  const base = snapshot(changes);
  const candidate = append({ ...changes, [branch]: 'export type other = {};\n' });
  refuses(
    scan(candidate, { anchor: base, base, legacyPins: kernelAnchorPins(base) }),
    `candidate: public export collision ${INDEX}#rates`
  );
});

for (const indirect of [false, true]) {
  test(`outside-root forward (${indirect ? 'indirect' : 'direct'})`, () => {
    const outside = 'apps/web/forward.ts';
    const target = indirect ? './src/intermediary' : '@interdomestik/database';
    refuses(
      scan(
        append({
          [outside]: `export * from '${target}';\nexport * from './other';\n`,
          'apps/web/src/intermediary.ts': "export * from '@interdomestik/database/schema';\n",
          'apps/web/other.ts': 'export const rates = 1;',
        })
      ),
      `candidate: schema forward outside scan roots ${outside}`
    );
  });
}

test('an unparseable outside file leaves forwarding unproven', () => {
  refuses(
    scan(append({ 'apps/web/forward.ts': 'export * from ;' })),
    'candidate: unparseable outside source apps/web/forward.ts'
  );
});

test('an unchanged caller selecting the new relational query key is refused', () => {
  const file = 'apps/web/src/dynamic.ts';
  const changes = {
    [file]:
      "import { db } from '@interdomestik/database/db';\n" +
      "export function read(key = 'rates') { return db.query[key]?.findMany(); }\n",
  };
  refuses(
    scan(append(changes), { base: snapshot(changes) }),
    `candidate: unproven dynamic schema consumer ${file}`
  );
});

test('query-map escape in a retained unit is refused even when its file changes', () => {
  const file = 'apps/web/src/retained.ts';
  const retained =
    "import { db as client } from '@interdomestik/database/db';\n" +
    "export function read(key = 'rates') { const map = client.query; return map[key]?.findMany(); }\n";
  const base = snapshot({ [file]: retained });
  refuses(
    scan(append({ [file]: `${retained}export const separateChange = true;\n` }), { base }),
    `candidate: unproven dynamic schema consumer ${file}`
  );
});

test('the schema namespace cannot escape into an unproven computed lookup', () => {
  const file = 'apps/web/src/namespace.ts';
  const changes = {
    [file]:
      "import * as schema from '@interdomestik/database/schema';\nexport const lookup = key => schema[key];\n",
  };
  refuses(
    scan(append(changes), { base: snapshot(changes) }),
    `candidate: unproven dynamic schema consumer ${file}`
  );
});

test('the checkout cannot substitute different closure bytes for the merge blobs', () => {
  refuses(
    scan(append(), { sourceView: append({ [NEW]: `${table()} ` }) }),
    `candidate: checkout differs from merge blob ${NEW}`
  );
});
