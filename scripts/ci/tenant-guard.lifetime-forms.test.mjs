import test from 'node:test';
import { assertLifetime, ENTRY } from './tenant-guard-lifetime-test-support.mjs';

test('L1: a transaction entry is called directly as (context, callback)', () => {
  assertLifetime(
    {
      namespace: [
        'f: the capability escapes its callback (BinaryExpression)',
        'export const f = () => ns.withTenantAuthority(a, (tx: any) => { kept = tx; });',
      ],
      entryAlias: [
        'E: a transaction entry used as a value',
        'const E = W;\nexport const f = () => E(a, (tx: any) => { kept = tx; });',
      ],
      entryCall: [
        'f: a transaction entry called other than as (context, callback)',
        'export const f = () => W.call(null, a, (tx: any) => { kept = tx; });',
      ],
      r2nsElement: [
        'f: a module object exporting a transaction entry used as a value',
        "export const f = () => (ns as any)['withTenantAuthority'](a, (tx: any) => { kept = tx; });",
      ],
      r2nsAlias: [
        'n: a module object exporting a transaction entry used as a value',
        'const n = ns;\nexport const f = () => n.withTenantAuthority(a, (tx: any) => { kept = tx; });',
      ],
      r2nsDestructure: [
        '<pattern>: a module object exporting a transaction entry used as a value',
        'const { withTenantAuthority: w } = ns;\nexport const f = () => w(a, (tx: any) => { kept = tx; });',
      ],
      r2heritage: [
        'C: the capability escapes its callback (BinaryExpression)',
        'function base(_: any) { return class {}; }\nexport class C extends base(W(a, (tx: any) => { kept = tx; })) {}',
      ],
      nestedNamespace: [
        'f: a module object exporting a transaction entry used as a value',
        "import * as outer from './barrel';\nexport const f = () => outer.inner.withTenantAuthority(a, (tx: any) => { kept = tx; });",
        { files: { 'apps/web/src/features/barrel.ts': `export * as inner from '${ENTRY}';` } },
      ],
      namespaceMemberAlias: [
        'n: a module object exporting a transaction entry used as a value',
        "import * as outer from './barrel';\nconst n = outer.inner;\nexport const f = () => n.withTenantAuthority(a, (tx: any) => { kept = tx; });",
        { files: { 'apps/web/src/features/barrel.ts': `export * as inner from '${ENTRY}';` } },
      ],
      nestedTwice: [
        'f: a module object exporting a transaction entry used as a value',
        "import * as outer from './barrel2';\nexport const f = () => outer.middle.inner.withTenantAuthority(a, (tx: any) => { kept = tx; });",
        {
          files: {
            'apps/web/src/features/barrel.ts': `export * as inner from '${ENTRY}';`,
            'apps/web/src/features/barrel2.ts': "export * as middle from './barrel';",
          },
        },
      ],
      moduleObjectExport: [
        'f: a module object exporting a transaction entry used as a value',
        "import * as outer from './barrel';\nexport const f = () => outer.inner.withTenantAuthority(a, (tx: any) => { kept = tx; });",
        {
          files: {
            'apps/web/src/features/barrel.ts': `import * as inner from '${ENTRY}';\nexport { inner };`,
          },
        },
      ],
      namedNamespace: [
        'f: a module object exporting a transaction entry used as a value',
        "import { inner } from './barrel';\nexport const f = () => inner.withTenantAuthority(a, (tx: any) => { kept = tx; });",
        { files: { 'apps/web/src/features/barrel.ts': `export * as inner from '${ENTRY}';` } },
      ],
      directNsAlias: [
        'f: the capability escapes its callback (BinaryExpression)',
        "import * as outer from './barrel';\nexport const f = () => outer.inner(a, (tx: any) => { kept = tx; });",
        {
          files: {
            'apps/web/src/features/barrel.ts': `export { withTenantAuthority as inner } from '${ENTRY}';`,
          },
        },
      ],
      trailingCallback: [
        'f: a transaction entry called other than as (context, callback)',
        'export const f = () => (W as any)(a, (tx: any) => { kept = tx; }, () => {});',
      ],
      spreadArgs: [
        'f: a transaction entry called other than as (context, callback)',
        'const args: any = [a, (tx: any) => { kept = tx; }];\nexport const f = () => (W as any)(...args);',
      ],
      namespaceCycle: [
        'alias: a module object exporting a transaction entry used as a value',
        "import * as A from './a';\nimport * as B from './b';\nA.n;\nconst alias = B;\nexport const f = () => alias.a.W(a, (tx: any) => { kept = tx; });",
        {
          files: {
            'apps/web/src/features/a.ts': `export * as b from './b';\nexport { withTenantAuthority as W } from '${ENTRY}';\nexport const n = 1;\n`,
            'apps/web/src/features/b.ts': "export * as a from './a';\n",
          },
        },
      ],
    },
    {
      safeBarrelCall: [
        "import { withTenantAuthority } from './barrel';\nexport const f = () => withTenantAuthority(a, async (tx: any) => tx.select());",
        {
          files: {
            'apps/web/src/features/barrel.ts': `export { withTenantAuthority } from '${ENTRY}';`,
          },
        },
      ],
      safeTwoArgs: 'export const f = () => W(a, (tx: any) => tx.select());',
    }
  );
});

test('L1: classes, `this` and tagged templates cannot retain the capability', () => {
  assertLifetime(
    {
      instanceField: [
        'f: a nested function or class captures it (tx)',
        'export const f = () => W(a, (tx: any) => { kept = class { x = tx.select(); }; });',
      ],
      returnClass: [
        'f: a nested function or class captures it (tx)',
        'export const f = () => W(a, (tx: any) => class { x = tx.select(); });',
      ],
      staticBlock: [
        'f: a nested function or class captures it (tx)',
        'export const f = () => W(a, (tx: any) => { kept = class { static { tx.select(); } }; });',
      ],
      classCarrier: [
        'f: h: a nested function or class captures it (p)',
        'function h(p: any) { return class { x = p.tx.select(); }; }\nexport const f = () => W(a, (tx: any) => h({ tx }));',
      ],
      tagWrapped: [
        'f: h: a carrier method call (leak)',
        'function leak(this: any) { kept = this.tx; }\nfunction h(p: any) { (p.leak as any)``; }\nexport const f = () => W(a, (tx: any) => h({ tx, leak }));',
      ],
      tagPlain: [
        'f: h: a carrier method call (other)',
        'function h(p: any) { p.other``; }\nexport const f = () => W(a, (tx: any) => h({ tx, other: 0 }));',
      ],
      asyncField: [
        'f: h: a nested function or class captures it (v)',
        'function h(v: any) { return class { x = v.select(); }; }\nexport const f = () => W(a, (tx: any) => { h(tx); });',
      ],
      escapedCallbackThis: [
        'f: a this reference',
        'export const f = () => W(a, function (tx: any) { kept = this; tx.select(); });',
      ],
      helperThis: [
        'f: h: a this reference',
        'function h(v: any) { kept = this; return v.select(); }\nexport const f = () => W(a, (tx: any) => h(tx));',
      ],
      closureCarrier: [
        'f: h: a nested function or class captures it (p)',
        'function h(p: any) { return () => p.n; }\nexport const f = () => W(a, (tx: any) => h({tx, n: 1}));',
      ],
    },
    {
      safeComputedLiteral:
        'function h({ tx: v }: any) { return v.select(); }\nexport const f = () => W(a, (tx: any) => h({ ["tx"]: tx }));',
      safeClassOutside:
        'class K { x = 1; }\nexport const f = () => W(a, (tx: any) => { kept = new K(); return tx.select(); });',
      safeOwnReadR3d:
        'function h(p: any) { const n = p.n; return () => n; }\nexport const f = () => W(a, (tx: any) => { h({tx, n: 1}); return tx.select(); });',
      safeGlobalAlias:
        'const g = globalThis as any;\nexport const f = () => { g.x = 1; return W(a, (tx: any) => tx.select()); };',
    }
  );
});
