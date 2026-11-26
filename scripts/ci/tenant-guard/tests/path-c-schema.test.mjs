import assert from 'node:assert/strict';
import test from 'node:test';
import { kernelAnchorPins } from '../rules-schema-admission.mjs';
import { INBOUND_TRANSITION, RATE_BOOK_TRANSITION } from '../schema-rate-book-transition.mjs';
import {
  BARREL,
  INBOUND,
  INBOUND_EXPORT,
  SCHEMA,
  dark,
  edit,
  main,
  prove,
  wp07,
} from './path-c-test-support.mjs';

test('M, W and D keep the complete reviewed kernel tuples', () => {
  const { entries } = JSON.parse(RATE_BOOK_TRANSITION);
  const tuple = side =>
    Object.fromEntries(Object.entries(entries).map(([key, pins]) => [key, pins[side]]));
  assert.deepEqual(Object.fromEntries(kernelAnchorPins(main)), tuple(0));
  assert.deepEqual(Object.fromEntries(kernelAnchorPins(wp07)), tuple(1));
  assert.deepEqual(
    Object.fromEntries(kernelAnchorPins(dark)),
    JSON.parse(INBOUND_TRANSITION).entries
  );
  for (const [base, candidate] of [
    [main, main],
    [main, wp07],
    [wp07, dark],
    [dark, dark],
  ]) {
    const proof = prove(base, candidate);
    assert.equal(proof.ok, true, proof.reason);
  }
});

test('D cannot skip W or return to W', () => {
  assert.match(prove(main, dark).reason, /requires the exact rate-book base/u);
  assert.equal(prove(dark, wp07).reason, `candidate: changed kernel module ${INBOUND}`);
});

test('an ordinary claim-inbound-documents-history table passes on M', () => {
  const name = 'claim-inbound-documents-history';
  const candidate = edit(main, [
    [BARREL, `${main.sources.get(BARREL)}export * from './${name}';\n`],
    [
      `${SCHEMA}/${name}.ts`,
      "import { pgTable, text } from 'drizzle-orm/pg-core';\n" +
        "export const claimInboundDocumentsHistory = pgTable('claim_inbound_documents_history', " +
        "{ id: text('id').primaryKey() }).enableRLS();\n",
    ],
  ]);
  for (const base of [main, candidate]) {
    const proof = prove(base, candidate);
    assert.equal(proof.ok, true, proof.reason);
  }
});

for (const [label, changes] of [
  ['file only', [[BARREL, wp07.sources.get(BARREL)]]],
  ['barrel only', [[INBOUND, null]]],
  [
    'a changed export of the exact inbound specifier without its module',
    [
      [BARREL, `${wp07.sources.get(BARREL)}export * from "./claim-inbound-documents";\n`],
      [INBOUND, null],
    ],
  ],
  ['reordered barrel', [[BARREL, INBOUND_EXPORT + wp07.sources.get(BARREL)]]],
  ['one extra byte', [[INBOUND, `${dark.sources.get(INBOUND)} `]]],
  ['changed inbound binding', [[`${SCHEMA}/auth.js`, 'export const users = {};\n']]],
  [
    'mixed W and D',
    [[`${SCHEMA}/exchange-rates.ts`, main.sources.get(`${SCHEMA}/exchange-rates.ts`)]],
  ],
]) {
  test(`D rejects ${label} in the candidate and retained base`, () => {
    const changed = edit(dark, changes);
    assert.equal(prove(wp07, changed).reason, 'candidate: partial or changed inbound schema image');
    assert.equal(prove(changed, dark).reason, 'base: partial or changed inbound schema image');
  });
}

for (const [record, diagnostic] of [
  [null, 'missing'],
  [' \n', 'empty'],
  ['{"files":', 'unparseable'],
  ['{}', 'invalid'],
]) {
  test(`inbound record refusal for ${diagnostic} input`, () => {
    const result = prove(wp07, dark, { inboundRecord: record });
    assert.equal(result.ok, false);
    assert.equal(result.reason, `${diagnostic} inbound schema transition record`);
  });
}

test('a validly shaped mixed D digest tuple fails closed', () => {
  const record = JSON.parse(INBOUND_TRANSITION);
  const [key] = Object.keys(record.entries);
  record.entries[key] = kernelAnchorPins(wp07).get(key);
  assert.match(
    prove(wp07, dark, { inboundRecord: JSON.stringify(record) }).reason,
    /partial or changed inbound/u
  );
});

test('exact D still checks checkout parity, resolver input and retained consumers', () => {
  const file = 'apps/web/src/path-c-retained.ts';
  const changed = edit(dark, [[file, 'export const value = 1;\n']]);
  assert.equal(
    prove(wp07, dark, { checkout: changed }).reason,
    `candidate: checkout differs from merge blob ${file}`
  );
  const config = 'tsconfig.path-c-test.json';
  const resolver = edit(dark, [
    [config, '{"compilerOptions":{"paths":{"@outside/*":["./outside/*"]}}}'],
  ]);
  assert.equal(prove(wp07, resolver).reason, `candidate: resolver input changed ${config}`);
  const reads = [
    [
      file,
      "import * as schema from '@interdomestik/database/schema';\nexport const read = key => schema[key];\n",
    ],
  ];
  assert.equal(
    prove(edit(wp07, reads), edit(dark, reads)).reason,
    `candidate: unproven dynamic schema consumer ${file}`
  );
});

test('the W table proof still rejects a duplicate database identity', () => {
  const duplicate = 'unused-test-table';
  const candidate = edit(wp07, [
    [BARREL, `${wp07.sources.get(BARREL)}export * from './${duplicate}';\n`],
    [
      `${SCHEMA}/${duplicate}.ts`,
      "import { pgTable, text } from 'drizzle-orm/pg-core';\nexport const duplicate = pgTable('exchange_rates', { id: text('id').primaryKey() }).enableRLS();\n",
    ],
  ]);
  assert.equal(
    prove(wp07, candidate).reason,
    'candidate: duplicate database identity public.exchange_rates'
  );
});
