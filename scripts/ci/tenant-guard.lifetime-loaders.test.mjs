import test from 'node:test';
import { assertLifetime, ENTRY } from './tenant-guard-lifetime-test-support.mjs';

test('L1: no module loader, evaluator or computed import reaches a transaction entry', () => {
  assertLifetime(
    {
      r2dynamic: [
        'f: a dynamic import of a module exporting a transaction entry',
        `export const f = async () => (await import('${ENTRY}')).withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      r3requireAlias: [
        'req: an indirect require',
        `const req = require;\nexport const f = () => req('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      r3requireParen: [
        'f: a dynamic import of a module exporting a transaction entry',
        `export const f = () => (require)('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      r3requireAs: [
        'f: a dynamic import of a module exporting a transaction entry',
        `export const f = () => (require as any)('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      r3createRequire: [
        '<ImportDeclaration@9>: an import of the module loader',
        `import { createRequire } from 'node:module';\nexport const f = () => createRequire('x')('${ENTRY}');`,
      ],
      r3processRequire: [
        'f: a module loader member (require)',
        `export const f = () => (process as any).mainModule.require('${ENTRY}');`,
      ],
      loaderImportEquals: [
        'm: a CommonJS import (import = require)',
        `import m = require('node:module');\nexport const f = () => m.createRequire('/tmp/x')('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      entryImportEquals: [
        'm: a CommonJS import (import = require)',
        `import m = require('${ENTRY}');\nexport const f = () => m.withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      parenOpaque: [
        'f: a dynamic import with a computed specifier',
        "export const f = () => (require)('@interdomestik/database/' + 'tenant-authority-context').withTenantAuthority(a, (tx: any) => { kept = tx; });",
      ],
      importOpaque: [
        'f: a dynamic import with a computed specifier',
        `const s = '${ENTRY}';\nexport const f = async () => (await import(s)).withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      importMeta: [
        'f: a module loader member (require)',
        `export const f = () => (import.meta as any).require('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      evalLoader: [
        'f: an eval-like global or bundler loader (eval)',
        `export const f = () => eval('require')('${ENTRY}');`,
      ],
      functionLoader: [
        'f: an eval-like global or bundler loader (Function)',
        `export const f = () => new Function('s', 'return import(s)')('${ENTRY}');`,
      ],
      webpackRequire: [
        'f: an eval-like global or bundler loader (__non_webpack_require__)',
        `declare const __non_webpack_require__: any;\nexport const f = () => __non_webpack_require__('${ENTRY}');`,
      ],
      jsonQuery: [
        'f: a dynamic import with a computed specifier',
        'export const f = async (n: string) => (await import(`./m/${n}`)).x;',
      ],
      jsonNoPrefix: [
        'f: a dynamic import with a computed specifier',
        'export const f = async (n: string) => (await import(`${n}.json`)).x;',
      ],
      dynamicLoader: [
        'f: a module loader member (createRequire)',
        `export const f = async () => (await import('node:module')).createRequire(import.meta.url)('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      computedModuleRequire: [
        'f: a module loader member (require)',
        `export const f = () => (module as any)['require']('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
        { file: 'r3.cts' },
      ],
      computedKey: [
        'f: a computed member of a module loader receiver',
        `const k = 'req' + 'uire';\nexport const f = () => (module as any)[k]('${ENTRY}');`,
      ],
      destructuredRequire: [
        '<pattern>: a module loader member (require)',
        `const { require: r } = module as any;\nexport const f = () => r('${ENTRY}');`,
      ],
      aliasedRequire: [
        'f: a module loader member (getBuiltinModule)',
        "const g: any = globalThis;\nexport const f = () => g.process.getBuiltinModule('node:module');",
      ],
      computedLoader: [
        '<pattern>: a module loader member (getBuiltinModule)',
        `const { ['getBuiltinModule']: load } = process as any;\nconst r = load('node:module').createRequire(import.meta.url);\nexport const f = () => r('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      assignmentLoader: [
        '<ExpressionStatement@9>: a module loader member (require)',
        `let r: any; ({ require: r } = module);\nexport const f = () => r('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
        { file: 'sample.cts' },
      ],
      evalMember: [
        'f: an eval-like global or bundler loader (eval)',
        `export const f = async () => (await globalThis.eval("import('${ENTRY}')")).withTenantAuthority(a, (tx: any) => { kept = tx; });`,
      ],
      constructorLoader: [
        'r: a module loader member (createRequire)',
        `const r = (module.constructor as any).createRequire(__filename);\nexport const f = () => r('${ENTRY}').withTenantAuthority(a, (tx: any) => { kept = tx; });`,
        { file: 'sample.cts' },
      ],
    },
    {
      safeJsonData:
        'export const f = async (l: string, n: string) => (await import(`../messages/${l}/${n}.json`)).default;',
      safeImportUrl:
        'export const u = import.meta.url;\nexport const f = () => W(a, (tx: any) => tx.select());',
      safeComputedTx:
        "export const f = (db: any) => db['transaction'](async (tx: any) => tx.select());",
    }
  );
});
