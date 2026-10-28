import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { createGraphProvenance } from './db-access-graph-provenance.mjs';
import { sourceDependencyObserver } from './db-access-source-dependencies.mjs';

const FILE = 'apps/web/src/app/page.ts';
function fixture(body = 'const alpha=1;alpha;', context) {
  const sources = new Map([
    [
      'packages/database/package.json',
      JSON.stringify({ name: '@interdomestik/database', exports: { '.': './src/index.ts' } }),
    ],
    [
      'packages/database/src/index.ts',
      'export {db,dbRls,dbAdmin} from "./db";export {withTenantContext} from "./tenant";',
    ],
    [
      'packages/database/src/db.ts',
      'export const db={} as any;export const dbRls={} as any;export const dbAdmin={} as any;',
    ],
    [
      'packages/database/src/tenant.ts',
      'export function withTenantContext(context:any,action:any){return action({});}',
    ],
    [FILE, body],
  ]);
  const model = createSourceModel(sources, sources),
    provenance = createProvenance(model);
  const sf = model.parsed.get(FILE),
    raw = sf.statements.at(-1).expression;
  return {
    model,
    provenance,
    raw,
    symbol: model.symbol(raw),
    warm: createGraphProvenance(provenance)(context),
    native: provenance.forContext(context),
    db: model.parsed.get('packages/database/src/db.ts').statements[0].declarationList
      .declarations[0],
  };
}

test('native UNKNOWN retains live metadata exceptions, then exposes DB and transaction answers', () => {
  const x = fixture(
    'import {withTenantContext} from "@interdomestik/database";const alpha=1;opaque(alpha);alpha;withTenantContext({},tx=>{tx;});'
  );
  let alpha, parameter;
  x.model.walk(x.model.parsed.get(FILE), node => {
    if (ts.isIdentifier(node) && node.text === 'alpha' && ts.isExpressionStatement(node.parent))
      alpha = node;
    if (ts.isParameter(node) && node.name.getText() === 'tx') parameter = node;
  });
  const symbol = x.model.symbol(alpha);
  assert.equal(x.warm.tenantHandle(alpha), 'unknown');
  Object.defineProperty(symbol, 'valueDeclaration', {
    configurable: true,
    get() {
      throw new Error('metadata');
    },
  });
  assert.throws(() => x.warm.tenantHandle(alpha), /metadata/);
  Object.defineProperty(symbol, 'valueDeclaration', {
    configurable: true,
    writable: true,
    value: parameter,
  });
  assert.equal(x.native.tenantHandle(alpha), true);
  assert.equal(x.warm.tenantHandle(alpha), true);
  const y = fixture();
  assert.equal(y.warm.provenance(y.raw), 'unknown');
  y.symbol.valueDeclaration = y.db;
  assert.equal(y.warm.provenance(y.raw), 'db');
});

for (const kind of [
  'replaced-array',
  'in-place-array',
  'inherited-data',
  'inherited-accessor',
  'bound-context',
  'method-getter',
])
  test(`UNKNOWN retries after ${kind} changes`, () => {
    const context = kind === 'bound-context' ? {} : undefined,
      x = fixture(undefined, context);
    assert.equal(x.warm.provenance(x.raw), 'unknown');
    if (kind === 'method-getter')
      Object.defineProperty(x.model, 'declaration', {
        get() {
          throw new Error('method');
        },
      });
    else if (kind === 'bound-context')
      Object.defineProperty(x.symbol, 'valueDeclaration', {
        get() {
          throw new Error('bound');
        },
      });
    else {
      delete x.symbol.valueDeclaration;
      if (kind === 'replaced-array') x.symbol.declarations = [x.db];
      else if (kind === 'in-place-array') x.symbol.declarations[0] = x.db;
      else {
        const parent = Object.create(Object.getPrototypeOf(x.symbol));
        Object.defineProperty(
          parent,
          'valueDeclaration',
          kind === 'inherited-data'
            ? { value: x.db }
            : {
                get() {
                  throw new Error('prototype');
                },
              }
        );
        Object.setPrototypeOf(x.symbol, parent);
      }
    }
    if (['method-getter', 'bound-context', 'inherited-accessor'].includes(kind))
      assert.throws(() => x.warm.provenance(x.raw));
    else assert.equal(x.warm.provenance(x.raw), x.native.provenance(x.raw));
  });

test('observer never executes an unused declarations-slot accessor', () => {
  const x = fixture();
  let calls = 0;
  Object.defineProperty(x.symbol.declarations, '0', {
    get() {
      calls++;
      throw new Error('unused');
    },
  });
  assert.equal(x.warm.provenance(x.raw), 'unknown');
  assert.equal(x.warm.provenance(x.raw), 'unknown');
  assert.equal(calls, 0);
});

test('raw, export and internal external checker paths cannot produce a lexical certificate', () => {
  const x = fixture('export const alpha=1;alpha;'),
    observer = sourceDependencyObserver(x.model);
  for (const query of [
    () => x.model.rawDeclaration(x.raw),
    () => x.model.externalName(x.raw),
    () => x.model.externalBinding(x.raw),
    () => x.model.isQueryOperator(x.raw),
    () => x.model.exportDeclaration(FILE, 'alpha'),
    () => x.model.exportedDeclarations(FILE),
  ])
    assert.ok(observer.capture(query).dependencies === undefined);
});

test('observations include warm lexical hits and reject within-query metadata changes even if restored', () => {
  const x = fixture(),
    observer = sourceDependencyObserver(x.model),
    original = x.symbol.valueDeclaration;
  const captured = observer.capture(() => {
    const before = x.provenance.provenance(x.raw);
    x.symbol.valueDeclaration = x.db;
    const during = x.provenance.provenance(x.raw);
    x.symbol.valueDeclaration = original;
    return [before, during];
  });
  assert.deepEqual(captured.value, ['unknown', 'db']);
  assert.ok(captured.dependencies === undefined);
});

test('certificate capacity refusal preserves real query answers and native fuel evidence', () => {
  const x = fixture(),
    observer = sourceDependencyObserver(x.model),
    before = [...x.provenance.analysisUnknown];
  const captured = observer.capture(() => {
    let value;
    for (let index = 0; index < 40000; index++) value = x.provenance.provenance(x.raw);
    return value;
  });
  assert.equal(captured.value, 'unknown');
  assert.ok(captured.dependencies === undefined);
  assert.equal(x.provenance.provenance(x.raw), 'unknown');
  assert.deepEqual([...x.provenance.analysisUnknown], before);
});

test('declaration-array proxies cannot certify a result from plain-looking descriptors', () => {
  const x = fixture(),
    original = x.symbol.declarations;
  let changed = false;
  delete x.symbol.valueDeclaration;
  x.symbol.declarations = new Proxy(original, {
    get(target, key, receiver) {
      return key === '0' && changed ? x.db : Reflect.get(target, key, receiver);
    },
  });
  assert.equal(x.warm.provenance(x.raw), 'unknown');
  changed = true;
  assert.equal(x.native.provenance(x.raw), 'db');
  assert.equal(x.warm.provenance(x.raw), 'db');
});

test('uncertifiable metadata proxies are refused without invoking reflection traps', () => {
  for (const kind of ['array', 'prototype']) {
    const x = fixture();
    let traps = 0;
    const target = kind === 'array' ? x.symbol.declarations : Object.getPrototypeOf(x.symbol);
    const proxy = new Proxy(target, {
      getOwnPropertyDescriptor() {
        traps++;
        throw new Error('unused reflection trap');
      },
      getPrototypeOf() {
        traps++;
        throw new Error('unused prototype trap');
      },
    });
    if (kind === 'array') x.symbol.declarations = proxy;
    else Object.setPrototypeOf(x.symbol, proxy);
    assert.equal(x.warm.provenance(x.raw), 'unknown');
    assert.equal(x.warm.provenance(x.raw), 'unknown');
    assert.equal(traps, 0);
  }
});
