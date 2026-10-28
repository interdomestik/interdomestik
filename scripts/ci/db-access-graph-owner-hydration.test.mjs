import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSourceModel } from './db-access-source.mjs';
import { encodeInventory, hydrateInventory } from './db-access-graph-workers.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory } from './db-access-inventory.mjs';

const file = 'apps/web/src/owner.ts';
function fixture() {
  const model = createSourceModel(
    new Map([
      [
        file,
        "import {db} from '@interdomestik/database'; export function owned() { db.select(); db.update(claims); }",
      ],
      [
        'apps/web/src/irrelevant.ts',
        Array.from({ length: 3000 }, (_, index) => `export const local${index}=${index};`).join(''),
      ],
    ]),
    new Map()
  );
  let owner;
  model.walk(model.parsed.get(file), node => {
    if (node.name?.getText() === 'owned') owner = node;
  });
  const inventory = collectInventory(model, createProvenance(model), new Map());
  inventory.changed = new Set(['apps/web/src/irrelevant.ts', file]);
  inventory.entries[0].retained = { value: 1 };
  inventory.entries[0]._indirect = true;
  inventory.entries[0]._incomplete = 'unresolved owner';
  const input = encodeInventory({ model, inventory });
  return { model, owner, input, operations: inventory.entries.map(row => row._node) };
}

test('owner hydration preserves every row, exact node identity and changed-root order', () => {
  const { model, owner, input, operations } = fixture();
  const result = hydrateInventory(model, input);
  assert.deepEqual([...result.changed], input.changed);
  assert.deepEqual(
    result.entries,
    input.entries.map((item, index) => ({
      ...item.row,
      _owner: owner,
      _node: operations[index],
      _indirect: item.indirect,
      _incomplete: item.incomplete,
    }))
  );
  assert.equal(result.entries[0]._owner, owner);
  assert.equal(result.entries[1]._owner, owner);
  assert.equal(result.entries[0].retained, input.entries[0].row.retained);
});

test('missing exact locators, foreign files and duplicate changed roots remain rejected', () => {
  for (const corrupt of [
    input => input.entries[0].owner[2]++,
    input => (input.entries[0].owner[0] = 'foreign.ts'),
    input => input.changed.push(file),
  ]) {
    const { model, input } = fixture();
    corrupt(input);
    assert.throws(() => hydrateInventory(model, input), /incomplete: graph worker/);
  }
});

test('a second matching node after the complete walk makes ownership ambiguous', () => {
  const { model, owner, input } = fixture();
  const duplicate = {
    ...model,
    walk(source, visit) {
      model.walk(source, visit);
      if (source === model.parsed.get(file)) visit(owner);
    },
  };
  assert.throws(() => hydrateInventory(duplicate, input), /missing or ambiguous owner/);
});
