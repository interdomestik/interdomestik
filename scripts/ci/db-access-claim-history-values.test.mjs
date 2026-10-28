import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const P = new URL('../../', import.meta.url).pathname,
  req = createRequire(P + '/package.json'),
  ts = req('typescript'),
  { z } = req(P + '/packages/domain-claims/node_modules/zod'),
  file = 'packages/domain-claims/src/claims/submitted-claim-lifecycle.ts';
const text = fs.readFileSync(P + '/' + file, 'utf8'),
  sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
let expression;
function walk(n) {
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'values'
  ) {
    assert.ok(!expression);
    expression = n.getText(sf);
  }
  ts.forEachChild(n, walk);
}
walk(sf);
const code =
  sf.statements
    .filter(n => ts.isVariableStatement(n))
    .map(n => n.getText(sf))
    .join('\n') +
  '\n' +
  expression;
function refuse(field, make) {
  let hooks = 0,
    values = 0;
  const args = {
    tenantId: 't',
    claimId: 'c',
    userId: 'u',
    changedByRole: 'member',
    publicNote: null,
    createdAt: new Date(),
  };
  args[field] = make(() => {
    hooks++;
    throw Error('forbidden capability hook');
  });
  const tx = {
    insert() {
      return {
        values() {
          values++;
        },
      };
    },
  };
  assert.throws(
    () =>
      vm.runInNewContext(code, {
        args,
        z,
        tx,
        claimStageHistory: {},
        crypto: {
          randomUUID() {
            return 'id';
          },
        },
      }),
    e => e.name === 'ZodError'
  );
  assert.equal(hooks, 0);
  assert.equal(values, 0);
}
for (const field of ['tenantId', 'claimId', 'userId', 'changedByRole', 'publicNote'])
  for (const [name, make] of [
    [
      'inheritedconstructor',
      hook =>
        Object.create({
          get constructor() {
            return hook();
          },
        }),
    ],
    ['proxyprototype', hook => new Proxy({}, { getPrototypeOf: hook })],
    [
      'proxyconstructor',
      hook =>
        new Proxy(Object.create(null), {
          get(t, k, r) {
            if (k === 'constructor') return hook();
            return Reflect.get(t, k, r);
          },
        }),
    ],
    [
      'revokedproxy',
      () => {
        const x = Proxy.revocable({}, {});
        x.revoke();
        return x.proxy;
      },
    ],
  ])
    test(field + ' refuses ' + name + ' without capability/prototype hook or SQL values', () =>
      refuse(field, make)
    );
for (const value of [undefined, 1, 1n, true, Symbol('capability'), () => {}, new String('boxed')])
  test('fixed error safely refuses ' + typeof value, () => refuse('tenantId', () => value));
test('fixed schema error takes precedence over mutable global error callbacks', () => {
  const before = z.config();
  let hooks = 0;
  try {
    z.config({
      customError() {
        hooks++;
        throw Error('global callback executed');
      },
      localeError() {
        hooks++;
        throw Error('locale executed');
      },
    });
    refuse('publicNote', () => Object.create(null));
    assert.equal(hooks, 0);
  } finally {
    z.config(before);
  }
});
