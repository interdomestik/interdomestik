import ts from 'typescript';

export const FIXTURE_A = {
  source: `function make(x: unknown) {
  const alias = x;
  const callback = () => alias.select(x, alias);
  function named() { return [alias, x, callback, alias]; }
  return named;
}
const a = { select() { return 1; } };
const b = { select() { return 2; } };
make(a); make(b);
const pair = [make(b), make(a)];`,
  roots(h) {
    const ctxA = h.context('make(a)');
    const ctxB = h.context('make(b)');
    const pair = h.find(
      node => ts.isArrayLiteralExpression(node) && ts.isVariableDeclaration(node.parent)
    );
    return [
      [h.returned('named'), ctxA],
      [h.returned('named'), ctxB],
      [h.returned('named'), undefined],
      [h.declared('callback'), ctxA],
      [pair, undefined],
    ];
  },
};

export const FIXTURE_B = {
  source: `declare const Base: any;
function make(x: unknown, y: unknown) {
  const pick = true ? x : y;
  const either = x || y;
  const both = x && y;
  const nul = x ?? y;
  const key = 'k';
  const box = { [key]: pick, ...(y as object), either, run() { return both; } };
  const cb = (z = nul, w = [both, box]) => [box, z, w, x, y, cb, (v = x) => v];
  return cb;
}
const a = { select() {} };
const b = { select() {} };
make(a, b); make(b, a);
const receiver = { m(q = a) { return [this, q, () => this, receiver]; } };
class Sub extends Base { run(s = b) { return [super.run(s), s, this]; } }`,
  roots(h) {
    const one = h.context('make(a, b)');
    const two = h.context('make(b, a)');
    const method = predicate => h.find(node => ts.isMethodDeclaration(node) && predicate(node));
    return [
      [h.returned('cb'), one],
      [h.returned('cb'), two],
      [h.returned('cb'), undefined],
      [method(node => node.name.getText() === 'm'), undefined],
      [method(node => ts.isClassDeclaration(node.parent)), undefined],
      [h.returned('cb'), one],
    ];
  },
};

export const FIXTURE_C = {
  source: `function make(x: unknown) {
  const alias = x;
  const callback = () => alias.select();
  return callback;
}
function factory() { return { make }; }
const a = { select() { return 1; } };
const made = factory().make(a);
const user = () => [made, made];
made();`,
  roots(h) {
    const made = h.target('made()');
    h.name(made.context, 'made()');
    for (const item of made.resolutionInvocations)
      h.name(item.context, `intermediary:${item.functionNode.name?.getText() ?? 'anonymous'}`);
    const makeContext = made.resolutionInvocations.find(
      item => item.functionNode === h.declared('make')
    ).context;
    return [
      [h.declared('user'), undefined],
      [h.returned('callback'), makeContext],
      [h.returned('callback'), made.context],
      [h.call('made()'), undefined],
    ];
  },
};

export const FIXTURE_D = {
  source: `const p = () => [q, p2, q];
const q = () => [p, q];
const p2 = () => p;
function rec(n: unknown) { return () => [rec, n, rec(n)]; }
const r = rec(p);`,
  roots(h) {
    const ctx = h.context('rec(p)');
    const inner = h.find(node => ts.isArrowFunction(node) && ts.isReturnStatement(node.parent));
    return [
      [h.declared('p'), undefined],
      [h.call('rec(p)'), undefined],
      [inner, ctx],
      [h.declared('p'), undefined],
    ];
  },
};

export const FIXTURES = {
  'captured aliases and named callbacks': FIXTURE_A,
  'syntax capture forms': FIXTURE_B,
  'factory returns and intermediaries': FIXTURE_C,
  'cycles and recursion': FIXTURE_D,
};
