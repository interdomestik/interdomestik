import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { KERNEL_ANCHOR, LEGACY_PINS } from './tenant-guard/manifest.mjs';
import { kernelAnchorPins, proveSchemaAdmission } from './tenant-guard/rules-schema-admission.mjs';
import { RATE_BOOK_TRANSITION } from './tenant-guard/schema-rate-book-transition.mjs';
import { gitIdentity, readSchemaTree, schemaTreeFromBlobs } from './tenant-guard/sources.mjs';

const ROOT = new URL('../../', import.meta.url);
const SCHEMA = 'packages/database/src/schema';
const FIXTURES = new URL('./tests/fixtures/wp07-rate-book/', import.meta.url);
const anchor = readSchemaTree(ROOT, KERNEL_ANCHOR, 'anchor');
const predecessor = readSchemaTree(ROOT, gitIdentity(ROOT, '7a461f277'), 'base');
const rateBookFiles = new Map(
  [
    'exchange-rates.ts',
    'exchange-rate-verifications.ts',
    'exchange-rate-checks.ts',
    'index.ts',
  ].map(file => [`${SCHEMA}/${file}`, readFileSync(new URL(`${file}.txt`, FIXTURES), 'utf8')])
);

function edit(tree, changes) {
  const blobs = new Map(tree.blobs);
  const files = new Map(tree.files);
  for (const [file, text] of changes) {
    if (text === null) {
      blobs.delete(file);
      files.delete(file);
    } else {
      blobs.set(file, text);
      files.set(file, { mode: '100644', kind: 'blob' });
    }
  }
  return schemaTreeFromBlobs(blobs, files);
}

const successor = edit(predecessor, rateBookFiles);

function prove(base, candidate, { checkout = candidate, transitionRecord } = {}) {
  return proveSchemaAdmission(
    { anchor, base, candidate },
    LEGACY_PINS,
    checkout.graph,
    checkout.sources,
    undefined,
    transitionRecord
  );
}

test('ordinary main and the exact reviewed rate-book transition pass', () => {
  const { entries } = JSON.parse(RATE_BOOK_TRANSITION);
  assert.deepEqual(
    Object.fromEntries(kernelAnchorPins(predecessor)),
    Object.fromEntries(Object.entries(entries).map(([key, [before]]) => [key, before]))
  );
  assert.deepEqual(
    Object.fromEntries(kernelAnchorPins(successor)),
    Object.fromEntries(Object.entries(entries).map(([key, [, after]]) => [key, after]))
  );
  const main = prove(predecessor, predecessor);
  const rateBook = prove(predecessor, successor);
  assert.equal(main.ok, true, main.reason);
  assert.equal(rateBook.ok, true, rateBook.reason);
});

test('a landed successor can serve as the protected base and refuses reversal', () => {
  const next = edit(successor, [['apps/web/src/wp07-next.ts', 'export const next = true;\n']]);
  const result = prove(successor, next);
  assert.equal(result.ok, true, result.reason);
  assert.match(prove(successor, predecessor).reason, /^candidate: changed kernel module /u);
});

test('a mixed kernel and a missing checks module are refused', () => {
  const verification = `${SCHEMA}/exchange-rate-verifications.ts`;
  const checks = `${SCHEMA}/exchange-rate-checks.ts`;
  for (const changes of [
    [[verification, predecessor.sources.get(verification)]],
    [[checks, null]],
  ]) {
    const result = prove(predecessor, edit(successor, changes));
    assert.equal(result.ok, false, result.reason);
    assert.match(result.reason, /^candidate: changed kernel module /u);
  }
});

for (const [file, text] of rateBookFiles) {
  test(`one extra byte in ${file} refuses the transition`, () => {
    const result = prove(predecessor, edit(successor, [[file, `${text} `]]));
    assert.equal(result.ok, false, result.reason);
    assert.match(result.reason, /^candidate: changed kernel module /u);
  });
}

test('unrelated retained kernel edits are refused with or without the rate-book files', () => {
  const file = 'packages/database/src/db.ts';
  const changes = [[file, `${predecessor.sources.get(file)} `]];
  for (const tree of [predecessor, successor]) {
    const result = prove(predecessor, edit(tree, changes));
    assert.equal(result.ok, false, result.reason);
    assert.equal(result.reason, `candidate: changed kernel module ${file}`);
  }
});

test('the exact transition still checks the candidate checkout', () => {
  const file = `${SCHEMA}/exchange-rate-checks.ts`;
  const checkout = edit(successor, [[file, `${successor.sources.get(file)} `]]);
  assert.equal(
    prove(predecessor, successor, { checkout }).reason,
    `candidate: checkout differs from merge blob ${file}`
  );
});

test('the exact transition still refuses an unreviewed resolver change', () => {
  const file = 'tsconfig.wp07-test.json';
  const text = JSON.stringify({ compilerOptions: { paths: { '@wp07-test/*': ['./outside/*'] } } });
  const result = prove(predecessor, edit(successor, [[file, text]]));
  assert.equal(result.ok, false);
  assert.equal(result.reason, `candidate: resolver input changed ${file}`);
});

test('the exact transition still checks retained dynamic schema consumers', () => {
  const file = 'apps/web/src/wp07-retained.ts';
  const text =
    "import * as schema from '@interdomestik/database/schema';\n" +
    'export const lookup = key => schema[key];\n';
  const changes = [[file, text]];
  const result = prove(edit(predecessor, changes), edit(successor, changes));
  assert.equal(result.ok, false);
  assert.equal(result.reason, `candidate: unproven dynamic schema consumer ${file}`);
});

for (const [kind, transitionRecord, diagnostic] of [
  ['missing', null, 'missing'],
  ['empty', '  \n', 'empty'],
  ['unparseable', '{"files":', 'unparseable'],
  ['valid but empty', '{"entries":{},"files":{},"import":[]}', 'invalid'],
]) {
  test(`a ${kind} transition record fails closed`, () => {
    for (const candidate of [predecessor, successor]) {
      assert.deepEqual(prove(predecessor, candidate, { transitionRecord }), {
        version: 2,
        ok: false,
        reason: `${diagnostic} rate-book transition record`,
      });
    }
  });
}
