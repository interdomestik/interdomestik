import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECK_DEF,
  FILE_LAYOUT,
  GUARD,
  GUARD_SOURCE,
  LAYOUT_IMPORT_SOURCE,
  MATCHES_LAYOUT,
  OUTPUT,
  OUTPUT_SOURCE,
  REFERENCE_LAYOUT,
  REFUSAL,
  REFUSAL_SOURCE,
  assertRefusedCalls,
  reflectRefusals,
} from './tenant-guard-lifetime-reflect-test-support.mjs';
import { run } from './tenant-guard-test-support.mjs';

const PRIVATE_FILE_CALLS = [
  ['privateFile', 'blobSize'],
  ['privateFile', 'fileName'],
  ['privateFile', 'blobType'],
  ['privateFile', 'fileTime'],
  ['privateFile', 'blobBytes'],
];

for (const [name, mutation] of [
  [
    'an imported File alias mutation',
    "import { File as NativeFile } from 'node:buffer'; Object.defineProperty(NativeFile.prototype, 'name', { get: fake });",
  ],
  [
    'an imported Blob alias delete',
    "import { Blob as NativeBlob } from 'buffer'; delete NativeBlob.prototype.arrayBuffer;",
  ],
  [
    'an imported module namespace alias',
    "import * as native from 'node:buffer'; const p = native.Blob.prototype; p.arrayBuffer = fake;",
  ],
  ['a buffer import', "import 'node:buffer';"],
]) {
  test(`L1 refuses all unchanged File calls for ${name}`, () => {
    assertRefusedCalls(OUTPUT, `${mutation}\n${OUTPUT_SOURCE}`, PRIVATE_FILE_CALLS);
  });
}

for (const mutation of [
  'target.prototype.getAll = fake;',
  'delete target.prototype.getAll;',
  '({ getAll: target.prototype.getAll } = replacement);',
  "Object.defineProperty(target.prototype, 'getAll', { value: fake });",
  'Object.defineProperties(target.prototype, { getAll: { value: fake } });',
  "Object['assign'](target.prototype, { getAll: fake });",
  'Object.setPrototypeOf(target.prototype, replacement);',
  'Object.freeze(target.prototype);',
  "Reflect.set(target.prototype, 'getAll', fake);",
  "Reflect.defineProperty(target.prototype, 'getAll', { value: fake });",
  'const define = Object.defineProperty; define(target.prototype, "getAll", { value: fake });',
  'Object["define" + "Property"](target.prototype, "getAll", { value: fake });',
  "target.prototype.__defineGetter__('getAll', fake);",
]) {
  test(`L1 refuses the unchanged call for a mutation through a bound alias: ${mutation}`, () => {
    const writer = `function replace(target: typeof FormData) { ${mutation} }`;
    assertRefusedCalls(REFUSAL, `${REFUSAL_SOURCE}\n${writer}`, [['readRawValue', 'formGetAll']]);
  });
}

test('L1 refuses a write through a local alias of a prototype obtained from an import', () => {
  const alias = [
    "import { native as constructor } from './native';",
    'const wrapper = { prototype: constructor.prototype };',
    'const alias = wrapper.prototype;',
    'alias.getAll = fake;',
  ].join('\n');
  assertRefusedCalls(REFUSAL, `${alias}\n${REFUSAL_SOURCE}`, [['readRawValue', 'formGetAll']], {
    'apps/web/src/lib/native.ts': 'export const native = FormData;',
  });
});

test('L1 refuses a call to the reviewed write helper from outside its pinned callers', () => {
  const put = `function put(target: FileSlot['target'], key: FileSlot['key'], value: unknown): void {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }`;
  const replace = "function replace(alias) { put(alias.prototype, 'entries', fake); }";
  const source = [GUARD_SOURCE, put, replace].join('\n');
  assertRefusedCalls(GUARD, source, [
    ['formNext', 'formEntries, new FormData()'],
    ['collectForm', 'formEntries, raw'],
    ['collectForm', 'formNext'],
  ]);
});

test('L1 requires the File layout support declarations in the admitted module', () => {
  const support = [REFERENCE_LAYOUT, FILE_LAYOUT, MATCHES_LAYOUT];
  const output = [
    "import { fileLayout, matchesLayout } from './file-layout';",
    support.reduce((source, unit) => source.replace(`${unit}\n`, ''), OUTPUT_SOURCE),
  ].join('\n');
  const helpers = [
    "import { ACCESSOR, isOwnReadable, ownKeys, ownValue } from './safe-action.check-def';",
    'type Slot = { key: PropertyKey; type: string; object?: ObjectLayout };',
    'type ObjectLayout = { prototype: object | null; slots: Slot[] };',
    ...support,
    'export { fileLayout, matchesLayout };',
  ].join('\n');
  assertRefusedCalls(OUTPUT, output, PRIVATE_FILE_CALLS, {
    [CHECK_DEF]: LAYOUT_IMPORT_SOURCE,
    'apps/web/src/lib/file-layout.ts': helpers,
  });
});

test('L1 admits the unchanged call alongside property definitions on a local object', () => {
  const local = `const local = {};
Object.defineProperty(local, 'FormData', { value: class {} });`;
  assert.deepEqual(run({ [REFUSAL]: `${local}\n${REFUSAL_SOURCE}` }).violations, []);
});

test('L1 refuses a mutation of the File prototype held in the layout sample', () => {
  const mutation = "Object.defineProperty(fileLayout.prototype, 'name', { get: fake });";
  const changed = OUTPUT_SOURCE.replace(FILE_LAYOUT, `${FILE_LAYOUT}\n${mutation}`);
  assertRefusedCalls(OUTPUT, changed, [
    ['privateFile', 'blobSize'],
    ['privateFile', 'fileName'],
    ['privateFile', 'blobType'],
    ['privateFile', 'fileTime'],
    ['privateFile', 'blobBytes'],
  ]);
});

for (const declaration of [
  'const Reflect = { apply: () => [] };',
  "import { replacement as Reflect } from './replacement';",
  'function another() { const Reflect = { apply: () => [] }; return Reflect; }',
  'namespace Reflect { export function apply() { return []; } }',
]) {
  test(`L1 refuses the unchanged call when Reflect is bound: ${declaration}`, () => {
    assertRefusedCalls(REFUSAL, [REFUSAL_SOURCE, declaration].join('\n'), [
      ['readRawValue', 'formGetAll'],
    ]);
  });
}

test('L1 keeps the admission within the reviewed file and unit', () => {
  const added = 'function another(raw: unknown) { return Reflect.apply(formGetAll, raw, []); }';
  assert.deepEqual(reflectRefusals(REFUSAL, `${REFUSAL_SOURCE}\n${added}`), ['another']);
  for (const file of [
    'apps/web/src/lib/safe-action.checks.ts',
    'apps/web/src/lib/safe-action.schema.ts',
    'apps/web/src/lib/safe-action.refusal-copy.ts',
  ]) {
    assert.deepEqual(reflectRefusals(file, REFUSAL_SOURCE), ['readRawValue'], file);
  }
});
