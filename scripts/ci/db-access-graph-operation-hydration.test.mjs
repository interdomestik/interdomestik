import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as proposed from './db-access-graph-workers.mjs';
import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { resolveLineageData } from './db-access-m4-lineage-selection.mjs';
import { createLineageObserver } from './db-access-m4-lineage-observer.mjs';
import { validateLineageBatch } from './db-access-m4-lineage-wire.mjs';
import { createGraphEntryEmitter } from './db-access-graph-emissions.mjs';
import { createIncompleteCollector } from './db-access-incomplete.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const file = 'apps/web/src/small-lineage.ts';
const text =
  "import {db} from '@interdomestik/database'; export function owned(){db.select();db.update(claims);}";
const model = createSourceModel(new Map([[file, text]]));
const inventory = collectInventory(model, createProvenance(model), new Map());
let owner, call;
const sf = model.parsed.get(file);
model.walk(sf, node => {
  if (ts.isFunctionDeclaration(node)) owner = node;
  if (ts.isCallExpression(node) && node.expression.getText(sf) === 'db.select') call = node;
});
const exact = node => ({
  startUtf16: node.getStart(sf),
  endUtf16: node.end,
  kindCode: node.kind,
  nodeSha256: hash(node.getText(sf)),
});
const catalog = {
  version: 1,
  historicalIdentitySelection: false,
  runtimeAdmission: false,
  frontier: { [file]: hash(text) },
  sites: [
    {
      id: 'small-real-protocol',
      family: 'fixture',
      side: 'new',
      file,
      sourceSha256: hash(text),
      calls: [exact(call)],
      owners: [exact(owner)],
      historicalIdentitiesReferenceOnly: [],
    },
  ],
};
const wire = proposed.encodeInventory({ model, inventory });
const hydrate = input => {
  const current = createSourceModel(new Map([[file, text]]));
  return { model: current, inventory: proposed.hydrateInventory(current, input) };
};

test('real collected operation survives structuredClone wire and strict re-encoding', () => {
  const current = hydrate(structuredClone(wire));
  assert.deepEqual(proposed.encodeInventory(current), wire);
  assert.equal(hash(JSON.stringify(proposed.encodeInventory(current))), hash(JSON.stringify(wire)));
  const parent = resolveLineageData(model, inventory, catalog).description;
  const worker = resolveLineageData(current.model, current.inventory, catalog).description;
  assert.deepEqual(worker, parent);
  for (let index = 0; index < inventory.entries.length; index++) {
    const row = current.inventory.entries[index],
      old = inventory.entries[index];
    assert.notStrictEqual(row._node, old._node);
    assert.strictEqual(row._node.getSourceFile(), current.model.parsed.get(file));
    assert.notDeepEqual(worker.entries[index].operation, worker.entries[index].owner);
  }
});
test('public rows/order/changed roots and old private flags remain exact', () => {
  const current = hydrate(structuredClone(wire));
  assert.deepEqual(wire.changed, [...inventory.changed]);
  assert.deepEqual(
    current.inventory.entries.map(row =>
      Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')))
    ),
    inventory.entries.map(row =>
      Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')))
    )
  );
});
for (const kind of [
  'missing',
  'foreign-file',
  'wrong-end',
  'source-text',
  'line',
  'owner-as-operation',
]) {
  test('rejects ' + kind + ' operation locator without dropping its obligation', () => {
    const input = structuredClone(wire),
      first = input.entries[0];
    if (kind === 'missing') delete first.operation;
    if (kind === 'foreign-file') first.operation[0] = 'foreign.ts';
    if (kind === 'wrong-end') first.operation[2]++;
    if (kind === 'source-text') first.row.source = 'foreign expression';
    if (kind === 'line') first.row.line++;
    if (kind === 'owner-as-operation') first.operation = [...first.owner];
    assert.throws(() => hydrate(input), /incomplete: graph worker/);
  });
}
test('ambiguous operation AST and changed parsed/source binding refuse', () => {
  const current = createSourceModel(new Map([[file, text]]));
  let operation;
  current.walk(current.parsed.get(file), node => {
    if (node.getText() === 'db.select') operation = node;
  });
  const duplicate = {
    ...current,
    walk(sf, visit) {
      current.walk(sf, visit);
      if (sf === current.parsed.get(file)) visit(operation);
    },
  };
  assert.throws(() => proposed.hydrateInventory(duplicate, wire), /ambiguous operation/);
  const changed = { ...current, sources: new Map([[file, text + '\n']]) };
  assert.throws(() => proposed.hydrateInventory(changed, wire), /source\/model drift/);
});
test('encoder refuses foreign model nodes and missing operations rather than substituting owners', () => {
  const foreign = createSourceModel(new Map([[file, text]]));
  let operation;
  foreign.walk(foreign.parsed.get(file), node => {
    if (node.getText() === 'db.select') operation = node;
  });
  for (const first of [
    { ...inventory.entries[0], _node: undefined },
    { ...inventory.entries[0], _node: operation },
  ])
    assert.throws(
      () => proposed.encodeInventory({ model, inventory: { ...inventory, entries: [first] } }),
      /incomplete: graph worker/
    );
});
test('real hydrated lineage observer and original emitter preserve every context and multiplicity', () => {
  function observe(prepared) {
    const selection = resolveLineageData(prepared.model, prepared.inventory, catalog);
    const locate = node =>
      node ? [prepared.model.fileOf(node), node.pos, node.end, node.kind] : null;
    const observer = createLineageObserver(selection, locate, () => undefined);
    const binding = {
      sourcePolicyDigest: hash('unit-only-policy'),
      sourceBookends: { before: hash(text), after: hash(text) },
      modelDigest: hash(JSON.stringify([...prepared.model.sources])),
    };
    const output = { failures: [], incomplete: createIncompleteCollector() };
    const emit = createGraphEntryEmitter(prepared.inventory.entries, {
      attribute: (token, kind, reason, row) => observer.attribute(token, kind, reason, row),
    });
    observer.begin();
    for (const index of [0, 0, 1]) {
      const row = prepared.inventory.entries[index],
        invocation = row._node.parent;
      const token = observer.observe(row._owner, file, invocation, null, null, 'visited');
      emit(row._owner, file, output, token);
    }
    const batch = observer.finish(binding, [file]);
    validateLineageBatch(
      batch,
      selection,
      binding,
      [file],
      value => value === null || (Array.isArray(value) && value.length === 4)
    );
    return {
      batch,
      failures: output.failures.map(row =>
        Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')))
      ),
      incomplete: output.incomplete.entries,
      raw: output.incomplete.rawCount,
    };
  }
  const parent = observe({ model, inventory }),
    worker = observe(hydrate(structuredClone(wire)));
  assert.deepEqual(worker, parent);
  assert.equal(worker.failures.length, 6);
  assert.equal(
    worker.batch.observations.reduce((sum, row) => sum + row.occurrences, 0),
    3
  );
  assert.equal(
    worker.batch.entryEmissions.reduce((sum, row) => sum + row.occurrences, 0),
    6
  );
});
test('real same-identity chained operations retain separate ordered node locators', () => {
  const chainFile = 'apps/web/src/chain.ts',
    chainText =
      "import {db} from '@interdomestik/database'; export function chain(){db.update(claims).update(claims);}";
  const chainModel = createSourceModel(new Map([[chainFile, chainText]]));
  const chainInventory = collectInventory(chainModel, createProvenance(chainModel), new Map());
  assert.equal(chainInventory.entries.length, 2);
  assert.equal(chainInventory.entries[0].identity, chainInventory.entries[1].identity);
  const chainWire = proposed.encodeInventory({ model: chainModel, inventory: chainInventory });
  assert.notDeepEqual(chainWire.entries[0].operation, chainWire.entries[1].operation);
  const current = createSourceModel(new Map([[chainFile, chainText]]));
  const restored = proposed.hydrateInventory(current, structuredClone(chainWire));
  assert.deepEqual(proposed.encodeInventory({ model: current, inventory: restored }), chainWire);
  assert.equal(restored.entries[0].identity, restored.entries[1].identity);
  assert.notStrictEqual(restored.entries[0]._node, restored.entries[1]._node);
});
