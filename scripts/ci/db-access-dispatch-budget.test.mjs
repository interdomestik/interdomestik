import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createDispatch } from './db-access-dispatch.mjs';
import {
  checkDispatchLimits,
  createDependencyMemo,
  createDispatchBudget,
} from './db-access-dispatch-budget.mjs';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

// The former global entry bound charged source traversal. These fixtures exceed it with ordinary
// harmless calls, so only a source-proportional baseline can admit them; no path is exempted.
const FORMER_GLOBAL_BOUND = 20000;
const BULK = FORMER_GLOBAL_BOUND + 500;
const bulk = (name, count) => `export function ${name}(){${'String(1);'.repeat(count)}return 1;}`;

function fixture(sources, options) {
  const model = createSourceModel(new Map(Object.entries(sources)));
  const dispatch = createDispatch(
    model,
    {
      isMutated: () => false,
      canonical: () => false,
    },
    options
  );
  const calls = [];
  for (const sf of model.parsed.values())
    model.walk(sf, node => {
      if (ts.isCallExpression(node)) calls.push(node);
    });
  return { dispatch, calls, call: text => calls.find(item => item.getText() === text) };
}
const reasonsOf = state => String([...state.reasons]);
const targetTexts = variants =>
  new Set(variants.flatMap(item => item.targets.map(target => target.functionNode.getText())));

test('dispatch limits and per-round budget stay finite and explicit', () => {
  for (const limits of [
    { maxRounds: 0, maxEntries: 1 },
    { maxRounds: 1.5, maxEntries: 1 },
    { maxRounds: 1, maxEntries: -1 },
    { maxRounds: 1, maxEntries: Infinity },
  ])
    assert.throws(() => checkDispatchLimits(limits), TypeError);
  assert.throws(
    () => fixture({ 'apps/web/src/a.ts': 'f();' }, { maxEntries: Infinity }),
    TypeError
  );
  const budget = createDispatchBudget(2);
  assert.deepEqual([budget.spend(), budget.spend(), budget.spend()], [true, true, false]);
  assert.equal(budget.exhausted, true);
  assert.equal(budget.spent, 3);
  assert.equal(createDispatchBudget(0).exhausted, false);
});

test('dependency memo admits reuse only while every observed escape answer is unchanged', () => {
  const escaped = new Set();
  const memo = createDependencyMemo(escaped, node => node.id);
  const recorded = memo.record(() => memo.isEscaped({ id: 'f' }));
  assert.equal(recorded.value, false);
  assert.equal(memo.valid(recorded), true);
  escaped.add('f');
  assert.equal(memo.valid(recorded), false);
  assert.equal(memo.valid(undefined), false);
  const self = memo.record(() => {
    const before = memo.isEscaped({ id: 'g' });
    escaped.add('g');
    memo.isEscaped({ id: 'g' });
    return before;
  });
  assert.equal(self.value, false);
  assert.equal(memo.valid(self), false, 'first observed answer governs reuse');
  assert.throws(() => memo.record(() => memo.record(() => 1)), /nested/u);
  assert.equal(memo.valid(memo.record(() => memo.isEscaped({ id: 'g' }))), true);
});

test('source traversal beyond the former global bound is fully indexed and uncharged', () => {
  const { dispatch, calls } = fixture(
    { 'apps/web/src/bulk.ts': bulk('bulk', BULK) },
    { maxEntries: 0 }
  );
  assert.ok(calls.length > FORMER_GLOBAL_BOUND);
  const state = dispatch.state();
  assert.equal(state.settled, true, reasonsOf(state));
  assert.equal(state.byCall.size, calls.length);
  assert.ok(calls.every(node => state.byCall.get(node)?.length === 1));
  assert.equal(state.budget.sourceCalls, calls.length);
  assert.equal(state.budget.expansion, 0);
});

test('large source keeps distinct local alternatives and an unknown sibling alternative', () => {
  const { dispatch, calls, call } = fixture({
    'apps/web/src/bulk.ts': bulk('bulk', BULK),
    'apps/web/src/example.ts': `import {getClient} from 'external'; function read(x){return x.select();}
      const a={select(){return 1;}}; const b={select(){return 2;}}; read(b); read(a); read(getClient());`,
  });
  const state = dispatch.state();
  assert.equal(state.reasons.size, 0, reasonsOf(state));
  assert.equal(state.byCall.size, calls.length);
  const variants = dispatch.variants(call('x.select()'));
  assert.equal(variants.length, 3);
  assert.equal(variants.filter(item => item.unknown).length, 1);
  assert.deepEqual(
    targetTexts(variants.filter(item => !item.unknown)),
    new Set(['select(){return 1;}', 'select(){return 2;}'])
  );
});

test('genuine context expansion exhaustion stays explicit unknown for every call', () => {
  const readers = Array.from(
    { length: 6 },
    (_, index) => `const a${index}={select(){return ${index};}}; read(a${index});`
  ).join(' ');
  const source = `function read(x){return x.select();} ${readers}`;
  const open = fixture({ 'apps/web/src/example.ts': source });
  assert.equal(open.dispatch.state().settled, true, reasonsOf(open.dispatch.state()));
  const resolved = open.dispatch.variants(open.call('x.select()'));
  assert.equal(resolved.length, 6);
  assert.ok(resolved.every(item => !item.unknown));
  assert.equal(targetTexts(resolved).size, 6);

  const bounded = fixture({ 'apps/web/src/example.ts': source }, { maxEntries: 4 });
  const state = bounded.dispatch.state();
  assert.equal(state.settled, false);
  assert.ok(state.reasons.has('dispatch-entry-bound'), reasonsOf(state));
  for (const node of bounded.calls) {
    const variants = bounded.dispatch.variants(node);
    assert.equal(variants.length, 1);
    assert.equal(variants[0].unknown, true);
    assert.ok(variants[0].reasons.includes('dispatch-entry-bound'));
  }

  const large = fixture(
    {
      'apps/web/src/bulk.ts': bulk('bulk', BULK),
      'apps/web/src/example.ts':
        'function read(x){return x.select();} const a={select(){}}; read(a);',
    },
    { maxEntries: 0 }
  );
  assert.equal(large.dispatch.state().settled, false);
  for (const node of [large.call('x.select()'), large.calls[0]]) {
    const [variant] = large.dispatch.variants(node);
    assert.equal(variant.unknown, true);
    assert.ok(variant.reasons.includes('dispatch-entry-bound'));
  }
});

test('late and early escapes converge to the same alternatives regardless of order', () => {
  for (const calls of ['read(a); later(read);', 'later(read); read(a);']) {
    const { dispatch, call } = fixture({
      'apps/web/src/bulk.ts': bulk('bulk', BULK),
      'apps/web/src/example.ts': `declare function later(fn: unknown): void; function read(x){return x.select();} const a={select(){}}; ${calls}`,
    });
    assert.ok(
      dispatch.variants(call('x.select()')).some(item => item.unknown),
      calls
    );
  }
  const outcomes = ['a.select(); later(a);', 'later(a); a.select();'].map(calls => {
    const { dispatch, call } = fixture({
      'apps/web/src/example.ts': `declare function later(v: unknown): void; const a={select(){return 1;}}; ${calls}`,
    });
    return dispatch.variants(call('a.select()')).some(item => item.unknown);
  });
  assert.equal(outcomes[0], outcomes[1]);
});

test('rebuild after reset reproduces identical context identities', () => {
  const { dispatch } = fixture({
    'apps/web/src/example.ts': `function read(x){return x.select();} function forward(y){return read(y);}
      const a={select(){return 1;}}; const b={select(){return 2;}}; forward(a); read(b);`,
  });
  const keys = state =>
    JSON.stringify(
      [...state.contexts].map(([fn, values]) => [fn.pos, [...values.keys()].sort()]).sort()
    );
  const first = dispatch.state();
  assert.equal(first.settled, true, reasonsOf(first));
  dispatch.reset();
  const second = dispatch.state();
  assert.notEqual(first, second);
  assert.equal(keys(first), keys(second));
});

const LEGACY_CALLS = 12000;
const NEW_CALLS = 8600;
const database = `import {db,withTenantContext} from '@interdomestik/database';`;
// Keep the same >20k source-call proof across ordinary sized modules. A single giant function
// instead exercises the separately retained graph traversal pathology, not the dispatch budget.
function writeBulkModules(root, prefix, count) {
  const imports = [],
    calls = [];
  for (let index = 0, remaining = count; remaining > 0; index++) {
    const size = Math.min(100, remaining);
    const name = `${prefix}${index}`;
    const file = `${prefix}-${index}`;
    writeFixture(root, `apps/web/src/${file}.ts`, bulk(name, size));
    imports.push(`import {${name}} from '../${file}';`);
    calls.push(`${name}();`);
    remaining -= size;
  }
  return { imports, calls };
}

for (const [label, example, expected] of [
  ['harmless new entry', undefined, 0],
  [
    'actual transaction handle sibling',
    `${database}function recur(x:any){if(flag)return x;return recur(x);}withTenantContext({},tx=>recur(tx));`,
    1,
  ],
  [
    'unknown external client sibling',
    `${database}import {getClient} from 'external-library';function lift(next:any){return()=>next();}const a=lift(()=>({select(){return 1;}}));const b=lift(()=>getClient());a().select();b().select();`,
    1,
  ],
])
  test(`authenticated CLI beyond the former global bound: ${label}`, () => {
    assert.ok(LEGACY_CALLS + NEW_CALLS > FORMER_GLOBAL_BOUND);
    const root = createTempRepo();
    const legacy = writeBulkModules(root, 'bulkLegacy', LEGACY_CALLS);
    sealFixture(root);
    const added = writeBulkModules(root, 'bulkNew', NEW_CALLS);
    writeFixture(
      root,
      'apps/web/src/app/page.tsx',
      `${[...legacy.imports, ...added.imports].join('\n')}export default function Page(){${[...legacy.calls, ...added.calls].join('')}return 1;}`
    );
    if (example) writeFixture(root, 'apps/web/src/example.ts', example);
    const result = runGuard(root);
    assert.equal(result.error, undefined, String(result.error));
    const report = readReport(root);
    const text = JSON.stringify(report);
    assert.equal(result.status, expected, text);
    assert.doesNotMatch(text, /dispatch-entry-bound|Maximum call stack|RangeError/u);
    if (expected) assert.ok(report.failingNewCount > 0 || report.incomplete.length > 0, text);
    else {
      assert.equal(report.status, 'pass');
      assert.equal(report.failingNewCount, 0);
      assert.deepEqual(report.incomplete, []);
    }
    if (label.includes('transaction'))
      assert.ok(
        report.newEntries.some(
          item =>
            item.tenantPosture === 'tenant-context' &&
            item.reason === 'tenant transaction handle escapes callback'
        ),
        text
      );
  });
