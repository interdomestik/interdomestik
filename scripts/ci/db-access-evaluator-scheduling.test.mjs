import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('./db-access-evaluator.mjs', import.meta.url), 'utf8');
const start = source.indexOf('export async function evaluateGuardParallel(');
assert.ok(start > 0);
const body = source.slice(start, source.indexOf('\nexport {', start)).replace('export ', '');

function fixture(failure) {
  const events = [];
  const adoption = Object.freeze({ name: 'canonical' });
  const prepared = Object.freeze({ name: 'prepared' });
  const graph = Object.freeze({ name: 'graph' });
  const inventory = Object.freeze({ entries: ['one', 'two'] });
  const report = Object.freeze({ name: 'report' });
  const pool = { close: async () => events.push('close') };
  const context = {
    ADOPTION: adoption,
    assertWorkerCode(root) {
      assert.equal(root, '/owned');
      events.push('authenticate');
      if (failure === 'authenticate') throw Error(failure);
    },
    prepareGuard(root, authority) {
      assert.equal(root, '/owned');
      assert.equal(authority, adoption);
      events.push('prepare');
      if (failure === 'prepare') throw Error(failure);
      return prepared;
    },
    startGraphWorkerPool(root) {
      assert.equal(root, '/owned');
      events.push('start');
      return pool;
    },
    graphSnapshot(value) {
      assert.equal(value, prepared);
      return 'snapshot';
    },
    encodeInventory(value) {
      assert.equal(value, prepared);
      return inventory;
    },
    async runParallelGraph(value, input, ownedPool) {
      assert.equal(value, prepared);
      assert.equal(input.snapshot, 'snapshot');
      assert.equal(input.inventory, inventory);
      assert.equal(ownedPool, pool);
      events.push('graph');
      if (failure === 'graph') throw Error(failure);
      return graph;
    },
    finalizeGuardAnalysis(value, result) {
      assert.equal(value, prepared);
      assert.equal(result, graph);
      events.push('finalize');
      if (failure === 'finalize') throw Error(failure);
      return { report };
    },
    evaluateGuard(root, authority) {
      assert.equal(root, '/owned');
      assert.notEqual(authority, adoption);
      events.push('serial');
      return report;
    },
  };
  vm.createContext(context);
  vm.runInContext(body, context);
  return { run: context.evaluateGuardParallel, adoption, report, events };
}

test('parent preparation completes before worker allocation, preserving graph input and report', async () => {
  const f = fixture();
  assert.equal(await f.run('/owned', f.adoption), f.report);
  assert.deepEqual(f.events, ['authenticate', 'prepare', 'start', 'graph', 'finalize', 'close']);
});
for (const failure of ['authenticate', 'prepare']) {
  test(failure + ' failure allocates no workers', async () => {
    const f = fixture(failure);
    await assert.rejects(f.run('/owned', f.adoption), new RegExp(failure));
    assert.deepEqual(
      f.events,
      failure === 'prepare' ? ['authenticate', 'prepare'] : ['authenticate']
    );
  });
}
for (const failure of ['graph', 'finalize']) {
  test(failure + ' failure closes the owned pool', async () => {
    const f = fixture(failure);
    await assert.rejects(f.run('/owned', f.adoption), new RegExp(failure));
    assert.equal(f.events.at(-1), 'close');
    assert.equal(f.events.filter(event => event === 'close').length, 1);
  });
}
test('noncanonical adoption retains the synchronous evaluator path', async () => {
  const f = fixture();
  assert.equal(await f.run('/owned', {}), f.report);
  assert.deepEqual(f.events, ['serial']);
});
