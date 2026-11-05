import test from 'node:test';
import { assertLifetime } from './tenant-guard-lifetime-test-support.mjs';

// A Drizzle opener detached from its client opens a transaction only with a client-like `this`:
// every read of a `transaction` member that is not called in place is followed to its uses.
test('L1: every transaction opener is a source; a detached opener cannot be rebound', () => {
  assertLifetime(
    {
      computedTransaction: [
        'f: the capability escapes its callback (BinaryExpression)',
        "export const f = (db: any) => db['transaction']((tx: any) => { kept = tx; });",
      ],
      boundTransaction: [
        'f: a transaction opener member (bind)',
        'export function f(db: any) { const open = db.transaction.bind(db); return open((tx: any) => { kept = tx; }); }',
      ],
      callTransaction: [
        'f: a transaction opener member (call)',
        'export const f = (db: any) => db.transaction.call(db, (tx: any) => { kept = tx; });',
      ],
      reflectTransaction: [
        'f: a transaction opener handed to a callee that is not a declared name (Reflect.apply)',
        'export const f = (db: any) => Reflect.apply(db.transaction, db, [(tx: any) => { kept = tx; }]);',
      ],
      aliasCall: [
        'f: a transaction opener member (call)',
        'export function f(db: any) { const open = db.transaction; return open.call(db, (tx: any) => { kept = tx; }); }',
      ],
      literalBind: [
        'f: a transaction opener member (bind)',
        "export const f = (db: any) => db.transaction['bind'](db)((tx: any) => { kept = tx; });",
      ],
      literalReflect: [
        "f: a transaction opener handed to a callee that is not a declared name (Reflect['apply'])",
        "export const f = (db: any) => Reflect['apply'](db.transaction, db, [(tx: any) => { kept = tx; }]);",
      ],
      destructuredOpener: [
        'f: a transaction opener member (call)',
        'export function f(db: any) { const { transaction: open } = db; return open.call(db, (tx: any) => { kept = tx; }); }',
      ],
      assignmentPattern: [
        'f: a transaction opener read by a destructuring assignment',
        'export function f(db: any) { let open: any; ({ transaction: open } = db); return open.call(db, (tx: any) => { kept = tx; }); }',
      ],
      installedOpener: [
        'f: a transaction opener used as a value (PropertyAssignment)',
        'export function f(db: any) { const o = { session: db.session, open: db.transaction }; return o.open((tx: any) => { kept = tx; }); }',
      ],
      assignedOpener: [
        'f: a transaction opener used as a value (BinaryExpression)',
        'export function f(db: any, o: any) { o.open = db.transaction; return o.open((tx: any) => { kept = tx; }); }',
      ],
      helperRebind: [
        'f: a transaction opener member (call)',
        'function run(open: any, db: any) { return open.call(db, (tx: any) => { kept = tx; }); }\nexport const f = (db: any) => run(db.transaction, db);',
      ],
      returnedOpener: [
        'f: a transaction opener used as a value (ReturnStatement)',
        'function pick(open: any) { return open; }\nexport const f = (db: any) => pick(db.transaction).call(db, (tx: any) => { kept = tx; });',
      ],
      reflectGet: [
        'f: a Reflect operation other than has or ownKeys',
        "export const f = (db: any) => Reflect.get(db, 'transaction').call(db, (tx: any) => { kept = tx; });",
      ],
      descriptor: [
        'f: a property descriptor read (getOwnPropertyDescriptor)',
        "export const f = (db: any) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(db), 'transaction');",
      ],
      constructorEval: [
        'f: a constructor member (it reaches the Function evaluator)',
        "export function f(db: any) { const open = ((() => {}) as any).constructor('db', 'cb', 'return db.transaction(cb)'); return open(db, (tx: any) => { kept = tx; }); }",
      ],
      protoConstructor: [
        'f: a constructor member (it reaches the Function evaluator)',
        "export const f = () => Object.getPrototypeOf(async () => {})['constructor']('return 1');",
      ],
      vmImport: [
        '<ImportDeclaration@9>: an import of the code evaluator',
        "import vm from 'node:vm';\nexport const f = (db: any) => vm.runInThisContext('(db, cb) => db.transaction(cb)')(db, (tx: any) => { kept = tx; });",
      ],
      valueOfCall: [
        'f: a method of a transaction opener invoked (valueOf)',
        'export const f = (db: any) => db.transaction.valueOf().call(db, (tx: any) => { kept = tx; });',
      ],
      taggedSpan: [
        'f: a transaction opener handed to a template tag',
        'export function f(db: any) { const tag = (_: any, open: any) => open.call(db, (tx: any) => { kept = tx; }); return tag`${db.transaction}`; }',
      ],
      implicitArguments: [
        'f: a transaction opener handed to implicit arguments',
        'function h(open: any, db: any) { return arguments[0].call(db, (tx: any) => { kept = tx; }); }\nexport const f = (db: any) => h(db.transaction, db);',
      ],
      varRedeclared: [
        'f: a redeclared transaction opener parameter (open)',
        'function h(open: any, db: any) { var open: any; return open.call(db, (tx: any) => { kept = tx; }); }\nexport const f = (db: any) => h(db.transaction, db);',
      ],
      thisParameter: [
        'f: a transaction opener handed to an explicit this parameter',
        'function h(this: void, open: any, db: any) { return open.call(db, (tx: any) => { kept = tx; }); }\nexport const f = (db: any) => h(db.transaction, db);',
      ],
      descriptorsValue: [
        'f: a property descriptor read (getOwnPropertyDescriptors)',
        'export function f(db: any) { const open = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(db)).transaction.value; return open.call(db, (tx: any) => { kept = tx; }); }',
      ],
      descriptorAlias: [
        'g: a property descriptor read (getOwnPropertyDescriptor)',
        'const g = Object.getOwnPropertyDescriptor;\nexport const f = (v: any, k: string) => g(v, k);',
      ],
      reflectConstructor: [
        'f: a Reflect operation other than has or ownKeys',
        "export function f(db: any) { const F = Reflect.get(() => {}, 'constructor'); return F('db', 'cb', 'return db.transaction(cb)')(db, (tx: any) => { kept = tx; }); }",
      ],
      reflectAlias: [
        'f: a Reflect operation other than has or ownKeys',
        'export function f(db: any) { const R = Reflect; return R.apply(db.transaction, db, [(tx: any) => { kept = tx; }]); }',
      ],
    },
    {
      safeDataField:
        'export const f = (e: any) => ({ transaction: e.transaction ? String(e.transaction) : undefined });',
      safeTypeof:
        "export const f = (db: any) => typeof db.transaction === 'function' ? W(a, (tx: any) => tx.select()) : null;",
      safeLiteral:
        "export const o = { requiredRole: 'x', name: 'n' };\nexport const f = () => W(a, (tx: any) => tx.select());",
      safeSentry:
        'function scrub(value: string): string { return /^x/.test(value) ? "x" : "[redacted]"; }\nexport const f = (e: any) => ({ transaction: e.transaction ? scrub(e.transaction) : undefined });',
      safePaddle:
        'function data(c: any) { return c.customData ?? c.custom_data ?? null; }\nfunction entries(t: any) { return [data(t), ...(t.items ?? []).map((i: any) => data(i))]; }\nexport const f = (p: any) => entries(p.transaction).length;',
      safeAssignTarget: 'export const f = (r: any, e: any) => { r.transaction = String(e.name); };',
      safeNullThis:
        'export function f(db: any) { const open = db.transaction; return open((tx: any) => { kept = tx; }); }',
      safeReflectKeys: 'export const f = (r: object) => Reflect.ownKeys(r).length;',
      safeUntaggedSpan: 'export const f = (e: any) => `${e.transaction}`;',
      safeOwnDescriptor:
        'export const f = (v: any, k: string) => Object.getOwnPropertyDescriptor(v, k)?.value;',
    }
  );
});
