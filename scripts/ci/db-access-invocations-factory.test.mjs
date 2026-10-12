import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';

function setup(source, options = {}) {
  const { file = 'apps/web/src/lib/factory.ts', ...callbacks } = options;
  const model = createSourceModel(new Map([[file, source]]));
  const resolver = createLocalInvocations(model, {
    isMutated: () => false,
    isEscaped: () => false,
    ...callbacks,
  });
  const calls = [];
  model.walk(model.parsed.get(file), node => {
    if (ts.isCallExpression(node)) calls.push(node);
  });
  const call = text => {
    const found = calls.filter(node => node.getText() === text);
    assert.equal(found.length, 1, `unique call ${text}`);
    return found[0];
  };
  return {
    resolver,
    call,
    calls,
    lastCall: model.parsed.get(file).statements.filter(ts.isExpressionStatement).at(-1)?.expression,
  };
}

function target(harness, text) {
  const call = harness.call(text);
  const result = harness.resolver.resolveCall(call);
  assert.equal(result.unknown, false, String(result.reasons));
  assert.deepEqual(result.reasons, []);
  assert.equal(result.targets.length, 1);
  const [value] = result.targets;
  assert.equal(value.functionNode, result.functions[0]);
  assert.equal(value.callNode, call);
  value.functionNode.parameters.forEach((parameter, index) => {
    assert.equal(value.argumentBindings.get(parameter), call.arguments[index]);
  });
  return value;
}

for (const [source, text, body, intermediary] of [
  [
    'function make() { return { select: () => 1 }; } make().select();',
    'make().select()',
    '() => 1',
    'make()',
  ],
  [
    'const make = () => ({ select: () => 1 }); const c = make(); c.select();',
    'c.select()',
    '() => 1',
    'make()',
  ],
  [
    'const q = { where() { return q; }, run() { return 1; } }; q.where().run();',
    'q.where().run()',
    'run()',
    'q.where()',
  ],
]) {
  test(`promotes the exact prior unsupported shape: ${text}`, () => {
    const h = setup(source);
    const value = target(h, text);
    assert.ok(value.functionNode.getText().startsWith(body));
    assert.deepEqual(
      value.resolutionInvocations.map(item => item.callNode.getText()),
      [intermediary]
    );
    const callable = h.resolver.resolveCallable(h.call(text).expression);
    assert.equal(callable.unknown, true);
    assert.ok(callable.reasons.includes('requires-invocation-context'));
  });
}

// Exact current transparent S8 createTx/type/settle source; never executes fixture code.
const CREATE_TX = String.raw`type Captured = {
  fields: Record<string, unknown>[];
  from: unknown[];
  where: unknown[];
  groupBy: unknown[];
  orderBy: unknown[];
  limit: number[];
};

const settle = (value: unknown) =>
  value instanceof Error ? Promise.reject(value) : Promise.resolve(value);

function createTx(countRows: unknown[] | Error, recentRows: unknown[] | Error) {
  const captured: Captured = {
    fields: [],
    from: [],
    where: [],
    groupBy: [],
    orderBy: [],
    limit: [],
  };
  const select = (fields: Record<string, unknown>) => {
    captured.fields.push(fields);
    const chain = {
      from: (table: unknown) => {
        captured.from.push(table);
        return chain;
      },
      where: (where: unknown) => {
        captured.where.push(where);
        return chain;
      },
      groupBy: (group: unknown) => {
        captured.groupBy.push(group);
        return settle(countRows);
      },
      orderBy: (order: unknown) => {
        captured.orderBy.push(order);
        return chain;
      },
      limit: (limit: number) => {
        captured.limit.push(limit);
        return settle(recentRows);
      },
    };
    return chain;
  };
  const tx = { select } as unknown as Parameters<typeof getAgentClientClaimSummary>[0];
  return { tx, captured };
}
`;

test('actual createTx terminals retain separate factory and select closure argument ASTs', () => {
  const group = "a.tx.select({ count: 1 }).from('claims').where('ks').groupBy('status')";
  const limit = "b.tx.select({ recent: 1 }).from('claims').where('mk').orderBy('date').limit(6)";
  const h = setup(`${CREATE_TX}
const a = createTx([101], [201]); const b = createTx([102], [202]);
${group}; ${limit};`);
  for (const [text, factoryText, terminal, ownArg, selection] of [
    [group, 'createTx([101], [201])', 'groupBy', "'status'", 'a.tx.select({ count: 1 })'],
    [limit, 'createTx([102], [202])', 'limit', '6', 'b.tx.select({ recent: 1 })'],
  ]) {
    const value = target(h, text);
    assert.ok(value.functionNode.parent.name?.text === terminal);
    assert.equal([...value.argumentBindings.values()][0].getText(), ownArg);
    const entries = value.resolutionInvocations;
    const factory = entries.find(item => item.callNode === h.call(factoryText));
    assert.ok(factory);
    factory.functionNode.parameters.forEach((parameter, index) => {
      assert.equal(value.closureBindings.get(parameter), h.call(factoryText).arguments[index]);
    });
    const select = entries.find(item => item.callNode === h.call(selection));
    assert.ok(select);
    assert.equal(
      value.closureBindings.get(select.functionNode.parameters[0]),
      h.call(selection).arguments[0]
    );
    assert.ok(entries.some(item => item.functionNode.parent.name?.text === 'from'));
    assert.ok(entries.some(item => item.functionNode.parent.name?.text === 'where'));
    assert.ok(
      value.functionNode.body.getText().includes(terminal === 'limit' ? 'recentRows' : 'countRows')
    );
    assert.equal(new Set(entries.map(item => item.callNode)).size, entries.length);
  }
});

test('destructured factory tx/select aliases retain closure and finite object identity', () => {
  const text = "selected.from('claims').where('ks').where('again').groupBy('status')";
  const h = setup(`${CREATE_TX}
const { tx } = createTx([303], [404]); const { select } = tx;
const selected = select({ alias: 1 }); ${text};`);
  const value = target(h, text);
  assert.ok(value.functionNode.parent.name?.text === 'groupBy');
  assert.deepEqual(
    value.resolutionInvocations.map(item => item.callNode.getText()),
    [
      'createTx([303], [404])',
      'select({ alias: 1 })',
      "selected.from('claims')",
      "selected.from('claims').where('ks')",
      "selected.from('claims').where('ks').where('again')",
    ]
  );
});

test('returned callbacks keep distinct allocations across repeated factory calls/resolutions', () => {
  const h = setup(
    'function make(value: unknown) { return () => value; } const a = make(1); const b = make(2); a(); b();'
  );
  for (let round = 0; round < 2; round += 1) {
    const a = target(h, 'a()');
    const b = target(h, 'b()');
    assert.equal(a.functionNode, b.functionNode);
    const parameter = a.resolutionInvocations[0].functionNode.parameters[0];
    assert.equal(a.closureBindings.get(parameter), h.call('make(1)').arguments[0]);
    assert.equal(b.closureBindings.get(parameter), h.call('make(2)').arguments[0]);
  }
});

test('finite nested same-function argument calls are distinct from recursive execution', () => {
  const h = setup(
    'function id(value: unknown) { return value; } const object = { run() { return 1; } }; id(id(object)).run();'
  );
  const value = target(h, 'id(id(object)).run()');
  assert.ok(value.functionNode.getText().startsWith('run()'));
  assert.equal(value.resolutionInvocations.length, 2);
  assert.equal(
    value.resolutionInvocations[0].functionNode,
    value.resolutionInvocations[1].functionNode
  );
  assert.notEqual(value.resolutionInvocations[0].callNode, value.resolutionInvocations[1].callNode);
});

test('intermediary ambient access and final handle forwarding remain visible, never certified safe', () => {
  const h = setup(
    'declare const db: any; function make(tx: unknown) { db.select(tx); return { run(value: unknown) { return value; } }; } const repo = make(db); repo.run(db);'
  );
  const value = target(h, 'repo.run(db)');
  assert.ok(value.resolutionInvocations[0].functionNode.body.getText().includes('db.select(tx)'));
  assert.equal(
    value.resolutionInvocations[0].argumentBindings.values().next().value,
    h.call('make(db)').arguments[0]
  );
  assert.ok(value.functionNode.body.getText().includes('return value'));
  assert.equal(value.argumentBindings.values().next().value, h.call('repo.run(db)').arguments[0]);
});

const NEGATIVE = [
  ['function make(a: unknown) { return { run() {} }; } make().run();'],
  ['function make() { return { run() {} }; } make(1).run();'],
  ['function make(a = 1) { return { run() {} }; } make(2).run();'],
  ['function make(...a: unknown[]) { return { run() {} }; } make().run();'],
  ['async function make() { return { run() {} }; } make().run();'],
  ['function* make() { return { run() {} }; } make().run();'],
  ['import { getClient } from "external"; getClient().select();'],
  ['import { vi } from "vitest"; const make = vi.fn(() => ({ run() {} })); make().run();'],
  ['function make() { return Promise.resolve({ run() {} }); } make().run();'],
  ['function make() { return { run() {} }; } const c = await make(); c.run();'],
  ['function make() { return { get run() { return () => 1; } }; } make().run();'],
  ['function make() { return { __proto__: { run() {} } }; } make().run();'],
  ['const key = "run"; function make() { return { [key]() {} }; } make().run();'],
  ['function make() { return 1; } make().run();'],
  ['function make() { return { run() {} }; } const object = make(); object();'],
  ['function make() { return () => 1; } const callable = make(); callable.run();'],
  [
    'function make(flag: boolean) { if (flag) return { run() {} }; return { run() {} }; } make(true).run();',
  ],
  ['function make(flag: boolean) { return flag ? { run() {} } : { run() {} }; } make(true).run();'],
  ['function make() { return make(); } make().run();'],
  ['function a() { return b(); } function b() { return a(); } a().run();'],
  [
    'function make() { return { run() {} }; } const c = make(); c.run();',
    { isMutated: n => n.getText() === 'c' },
  ],
  [
    'function make() { return { run() {} }; } const c = make(); const alias = c; alias.run();',
    { isEscaped: n => n.getText() === 'c' },
  ],
  [
    'function make() { return () => 1; } const fn = make(); fn();',
    { isEscaped: n => ts.isArrowFunction(n) },
  ],
  ['function make() { return { run() {} }; } make().run();', { maxSteps: 1 }],
];
for (const [source, options] of NEGATIVE) {
  test(`factory fails closed: ${source}`, () => {
    const h = setup(source, options);
    const call = h.lastCall;
    assert.ok(ts.isCallExpression(call));
    const result = h.resolver.resolveCall(call);
    assert.equal(result.unknown, true, call.getText());
    assert.deepEqual(result.targets, []);
    assert.ok(result.reasons.length > 0);
  });
}

test('unknown external factories remain equal for ordinary and hidden.test module names', () => {
  const source = 'import { getClient } from "external"; getClient().select();';
  const results = ['ordinary.ts', 'hidden.test.ts'].map(name => {
    const h = setup(source, { file: `apps/web/src/lib/${name}` });
    return h.resolver.resolveCall(h.call('getClient().select()'));
  });
  assert.equal(results[0].unknown, true);
  assert.deepEqual(results[0], results[1]);
});
