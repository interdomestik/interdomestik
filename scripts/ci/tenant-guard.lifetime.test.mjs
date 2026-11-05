import test from 'node:test';
import { assertLifetime } from './tenant-guard-lifetime-test-support.mjs';

test('L1: helpers, carriers and nested transactions keep the capability inside the callback', () => {
  assertLifetime(
    {
      defaultCb: [
        'r: a callback read from a parameter (cb)',
        'function r(cb: any = (v: any) => { kept = v; }) { return W(a, (tx: any) => cb(tx)); }\nexport const f = () => r();',
      ],
      overwrite: [
        'r: a callee that is not a declared name (p.cb)',
        'function bad(v: any) { kept = v; }\nfunction r(p: any) { p.cb = bad; return W(a, (tx: any) => p.cb(tx)); }\nexport const f = () => r({ cb: (v: any) => v.select() });',
      ],
      dupDestructure: [
        'f: h: the capability escapes its callback (BinaryExpression)',
        'function h({ x: u, x: v }: any) { u.select(); kept = v; }\nexport const f = () => W(a, (tx: any) => h({ x: tx }));',
      ],
      protoGetter: [
        'f: a carrier object with spreads, methods or computed keys',
        'const proto = { get other() { kept = (this as any).tx; return 0; } };\nfunction h(p: any) { return () => p.other; }\nexport const f = () => W(a, (tx: any) => h({ tx, __proto__: proto }));',
      ],
      aliasContinue: [
        'f: an asynchronous helper that is not awaited (h)',
        'function h(v: any) { const b = v; return later(b); }\nexport const f = () => W(a, (tx: any) => { h(tx); });',
      ],
      detachedNested: [
        'f: a nested transaction that is not awaited',
        'export const f = () => W(a, (tx: any) => { tx.transaction(async (inner: any) => { await delay(); await inner.select(); }); });',
      ],
      tryFinally: [
        'f: an asynchronous helper that is not awaited (later)',
        'export const f = () => W(a, (tx: any) => { try { return later(tx); } finally { throw new Error(); } });',
      ],
      r2sibling: [
        'r: a callee that is not a declared name (p.cb)',
        'function bad(v: any) { kept = v; }\nfunction r(p: any) { p.flip(); return W(a, (tx: any) => p.cb(tx)); }\nexport const f = () => r({ cb: (v: any) => v.select(), flip() { this.cb = bad; } });',
      ],
      r2forOf: [
        'r: a callback read from a parameter (cb)',
        'function bad(v: any) { kept = v; }\nfunction r(cb: any) { for (cb of [bad]) {} return W(a, (tx: any) => cb(tx)); }\nexport const f = () => r((v: any) => v.select());',
      ],
      r2forOfDecl: [
        'f: a callee that is not a stable function declaration (h)',
        'function bad(v: any) { kept = v; }\nfunction h(v: any) { return v.select(); }\nexport const f = () => { for (h of [bad]) {} return W(a, (tx: any) => h(tx)); };',
      ],
      r2varRedecl: [
        'f: a redeclared capability binding (tx)',
        'export const f = () => W(a, function (tx: any) { var tx: any; kept = tx; });',
      ],
      r2fnRedecl: [
        'f: a callee that is not a stable function declaration (h)',
        'function bad(v: any) { kept = v; }\nvar h: any = bad;\nfunction h(v: any) { return v.select(); }\nexport const f = () => W(a, (tx: any) => h(tx));',
      ],
      r2loose: [
        'f: a carrier object with spreads, methods or computed keys',
        'function valueOf(this: any) { kept = this.tx; return 1; }\nfunction h(p: any) { return p == 1; }\nexport const f = () => W(a, (tx: any) => h({ tx, valueOf }));',
      ],
      r2inherited: [
        'r: a callee that is not a declared name (p.cb)',
        'function bad(v: any) { kept = v; }\n(Object.prototype as any).cb = bad;\nfunction r(p: any) { return W(a, (tx: any) => p.cb(tx)); }\nexport const f = () => r({});',
      ],
      r2inheritedGetter: [
        'f: h: a nested function or class captures it (p)',
        'function h(p: any) { return () => p.other; }\nexport const f = () => W(a, (tx: any) => h({ tx }));',
      ],
      r3memoKeys: [
        'f: h: a member the carrier does not own (other)',
        'function h(p: any) { return p.other; }\nexport const f = () => W(a, (tx: any) => { h({ tx, other: 0, x: 0 }); return h({ tx, "other,x": 0 }); });',
      ],
      r3optionalDelete: [
        'f: h: a written carrier member (other)',
        'function h(p: any) { delete p?.other; return p.other; }\nexport const f = () => W(a, (tx: any) => h({ tx, other: 0 }));',
      ],
      r3destructureAfterDelete: [
        'f: h: a written carrier member (other)',
        'function h(p: any) { delete p.other; const { other } = p; return other; }\nexport const f = () => W(a, (tx: any) => h({ tx, other: 0 }));',
      ],
    },
    {
      safeJoined:
        'export const f = () => W(a, async (tx: any) => { await later(tx); return tx.select(); });',
      safeNested:
        'export const f = () => W(a, async (tx: any) => tx.transaction(async (inner: any) => inner.select()));',
      safeHelper:
        'async function h(v: any) { return v.select(); }\nexport const f = () => W(a, async (tx: any) => { const r = await h(tx); return r; });',
      safeCarrier:
        'async function h(deps: { db: any; n: number }) { return deps.db.select(deps.n); }\nexport const f = () => W(a, (tx: any) => h({ db: tx, n: 1 }));',
      safeOwnRead:
        'async function h(p: any) { return p.tx.select(p.n); }\nexport const f = () => W(a, (tx: any) => h({ tx, n: 1 }));',
      safeNsCall:
        'export const f = () => ns.withTenantAuthority(a, async (tx: any) => tx.select());',
    }
  );
});

test('L1: a capability returned, stored, thrown or handed to a container escapes its callback', () => {
  assertLifetime(
    {
      returnTx: [
        'f: the capability escapes its callback (ArrowFunction)',
        'export const f = (s: any) => W(a, async tx => tx);',
      ],
      storeModule: [
        'f: the capability escapes its callback (BinaryExpression)',
        'export const f = (s: any) => W(a, async tx => { kept = tx; });',
      ],
      pushArray: [
        'f: a callee that is not a declared name (box.push)',
        'export const f = (s: any) => W(a, async tx => { box.push(tx); });',
      ],
      returnObject: [
        'f: a carrier object that is not a call argument (ArrowFunction)',
        'export const f = (s: any) => W(a, async tx => ({ tx }));',
      ],
      returnArray: [
        'f: the capability escapes its callback (ArrayLiteralExpression)',
        'export const f = (s: any) => W(a, async tx => [tx]);',
      ],
      returnClosure: [
        'f: a nested function or class captures it (tx)',
        'export const f = (s: any) => W(a, async tx => () => tx.select());',
      ],
      setTimeout: [
        'f: a nested function or class captures it (tx)',
        'export const f = (s: any) => W(a, async tx => { setTimeout(() => tx.select(), 10); });',
      ],
      promiseThen: [
        'f: a nested function or class captures it (tx)',
        'export const f = (s: any) => W(a, async tx => { Promise.resolve().then(() => tx.select()); });',
      ],
      throwTx: [
        'f: the capability escapes its callback (ThrowStatement)',
        'export const f = (s: any) => W(a, async tx => { throw tx; });',
      ],
      conditional: [
        'f: the capability escapes its callback (ConditionalExpression)',
        'export const f = (s: any, c: boolean) => W(a, async tx => (c ? tx : null));',
      ],
      comma: [
        'f: the capability escapes its callback (BinaryExpression)',
        'export const f = (s: any) => W(a, async tx => (0, tx));',
      ],
      awaitTx: [
        'f: the capability escapes its callback (AwaitExpression)',
        'export const f = (s: any) => W(a, async tx => await tx);',
      ],
      objectAssign: [
        'f: a callee that is not a declared name (Object.assign)',
        'export const f = (s: any) => W(a, async tx => { Object.assign(globalThis, { tx }); });',
      ],
      opaqueCallee: [
        'f: a callback read from a parameter (cb)',
        'export const f = (s: any, cb: any) => W(a, async tx => cb(tx));',
      ],
      mapCollection: [
        'f: a callee that is not a declared name (new Map().set)',
        'export const f = (s: any) => W(a, async tx => { new Map().set("k", tx); });',
      ],
      generatorYield: [
        'f: g: a generator (its iterator retains its parameters)',
        'export function* g(tx: any) { yield tx; }\nexport const f = (s: any) => W(a, async tx => [...g(tx)]);',
      ],
      nestedReturn: [
        'f: the capability escapes its callback (ArrowFunction)',
        'export const f = (s: any) => W(a, async tx => tx.transaction(async (inner: any) => inner));',
      ],
      taggedTemplate: [
        'f: the capability escapes its callback (TemplateSpan)',
        'const tag = (s: any, v: any) => v;\nexport const f = (s: any) => W(a, async tx => tag`${tx}`);',
      ],
    },
    {
      safeSelect: 'export const f = (s: any) => W(a, async tx => tx.select());',
    }
  );
});
