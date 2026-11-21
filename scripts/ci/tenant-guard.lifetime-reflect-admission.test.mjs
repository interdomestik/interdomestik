import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOB_BYTES,
  BLOB_SIZE,
  BLOB_TYPE,
  CHECK_DEF,
  COLLECT_FORM,
  ENTRIES,
  FILE_NAME,
  FILE_TIME,
  FORM_NEXT,
  GET_ALL,
  GUARD,
  GUARD_SOURCE,
  LAYOUT_IMPORT_SOURCE,
  OUTPUT,
  OUTPUT_SOURCE,
  READ_RAW_VALUE,
  REFUSAL,
  REFUSAL_SOURCE,
  assertRefusedCalls,
  reflectRefusals,
} from './tenant-guard-lifetime-reflect-test-support.mjs';
import { run } from './tenant-guard-test-support.mjs';
import { LIFETIME_REFLECT_ADMISSIONS } from './tenant-guard/lifetime-reflect-admissions.mjs';

const REGEXP_SOURCE =
  "const regExpSource = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')!.get!;";
const REGEXP_FLAGS =
  "const regExpFlags = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags')!.get!;";
const REGEX_DEFINITION = `export function regexDefinition(
  check: unknown,
  format: unknown,
  pattern: unknown
): readonly [source: string, flags: string] | undefined {
  if (
    typeof format !== 'string' ||
    !patternedFormats.has(format) ||
    !hasTrait(check, '$ZodCheckStringFormat') ||
    !types.isRegExp(pattern) ||
    Object.getPrototypeOf(pattern) !== RegExp.prototype ||
    ownKeys(pattern).length !== 1 ||
    !Object.hasOwn(pattern, 'lastIndex')
  )
    return undefined;
  return [
    Reflect.apply(regExpSource, pattern, []),
    Reflect.apply(regExpFlags, pattern, [])
  ];
}`;
const CHECK_DEF_SOURCE = [REGEXP_SOURCE, REGEXP_FLAGS, REGEX_DEFINITION].join('\n');

test('L1 WP-02 admissions name exactly the reviewed units, operations and intrinsics', () => {
  assert.deepEqual(
    LIFETIME_REFLECT_ADMISSIONS.map(({ file, unit, operation, targets }) => [
      `${file}#${unit}`,
      operation,
      targets.map(({ intrinsic }) => intrinsic),
    ]),
    [
      [
        `${CHECK_DEF}#regexDefinition`,
        'apply',
        ['RegExp.prototype.source getter', 'RegExp.prototype.flags getter'],
      ],
      [`${GUARD}#formNext`, 'apply', ['FormData.prototype.entries']],
      [
        `${GUARD}#collectForm`,
        'apply',
        ['FormData.prototype.entries', 'FormData entries iterator prototype.next'],
      ],
      [
        `${OUTPUT}#privateFile`,
        'apply',
        [
          'Blob.prototype.size getter',
          'File.prototype.name getter',
          'Blob.prototype.type getter',
          'File.prototype.lastModified getter',
          'Blob.prototype.arrayBuffer',
        ],
      ],
      [`${REFUSAL}#readRawValue`, 'apply', ['FormData.prototype.getAll']],
    ]
  );
});

test('L1 admits the reviewed direct intrinsic calls with their captured targets', () => {
  assert.deepEqual(run({ [REFUSAL]: REFUSAL_SOURCE, [GUARD]: GUARD_SOURCE }).violations, []);
});

for (const [file, source] of [
  [CHECK_DEF, CHECK_DEF_SOURCE],
  [OUTPUT, OUTPUT_SOURCE],
]) {
  test(`L1 admits all reviewed intrinsic calls in ${file}`, () => {
    const imports = file === OUTPUT ? { [CHECK_DEF]: LAYOUT_IMPORT_SOURCE } : {};
    assert.deepEqual(run({ ...imports, [file]: source }).violations, []);
  });
}

for (const [file, source, capture, binding, unit] of [
  [CHECK_DEF, CHECK_DEF_SOURCE, REGEXP_SOURCE, 'regExpSource', 'regexDefinition'],
  [CHECK_DEF, CHECK_DEF_SOURCE, REGEXP_FLAGS, 'regExpFlags', 'regexDefinition'],
  [OUTPUT, OUTPUT_SOURCE, BLOB_SIZE, 'blobSize', 'privateFile'],
  [OUTPUT, OUTPUT_SOURCE, FILE_NAME, 'fileName', 'privateFile'],
  [OUTPUT, OUTPUT_SOURCE, BLOB_TYPE, 'blobType', 'privateFile'],
  [OUTPUT, OUTPUT_SOURCE, FILE_TIME, 'fileTime', 'privateFile'],
  [OUTPUT, OUTPUT_SOURCE, BLOB_BYTES, 'blobBytes', 'privateFile'],
  [REFUSAL, REFUSAL_SOURCE, GET_ALL, 'formGetAll', 'readRawValue'],
]) {
  test(`L1 refuses the unchanged ${unit} call on a changed ${binding} capture`, () => {
    const changed = source.replace(capture, `const ${binding} = () => undefined;`);
    assertRefusedCalls(file, changed, [[unit, binding]]);
  });
}

test('L1 refuses a change to the admitted calling unit even when the Reflect call is unchanged', () => {
  const changed = READ_RAW_VALUE.replace('values.length === 1', 'values.length >= 1');
  assert.deepEqual(reflectRefusals(REFUSAL, `${GET_ALL}\n${changed}`), ['readRawValue']);
});

test('L1 refuses other operations and indirect Reflect access in an admitted unit', () => {
  for (const call of [
    'Reflect.construct(formGetAll, [])',
    "Reflect.get(FormData.prototype, 'getAll')",
    'Reflect.get(rawInput, from)',
    'Reflect.apply(rawInput, undefined, [])',
    'Reflect["apply"](formGetAll, rawInput, [from])',
    '(0, Reflect.apply)(formGetAll, rawInput, [from])',
  ]) {
    const changed = READ_RAW_VALUE.replace('Reflect.apply(formGetAll, rawInput, [from])', call);
    assert.deepEqual(reflectRefusals(REFUSAL, `${GET_ALL}\n${changed}`), ['readRawValue'], call);
  }
});

test('L1 refuses a changed capture or a shadowed intrinsic in the unchanged calling unit', () => {
  for (const capture of [
    'const formGetAll = (value: unknown) => value;',
    'const formGetAll = FormData.prototype.entries;',
    'let formGetAll = FormData.prototype.getAll;',
    `import { FormData } from './replacement';\n${GET_ALL}`,
    `const FormData = { prototype: { getAll: (value: unknown) => value } };\n${GET_ALL}`,
    `FormData.prototype.getAll = () => [];\n${GET_ALL}`,
  ]) {
    assert.deepEqual(
      reflectRefusals(REFUSAL, `${capture}\n${READ_RAW_VALUE}`),
      ['readRawValue'],
      capture
    );
  }
});

test('L1 authenticates the FormData iterator target through its entries capture', () => {
  const changed = ['const formEntries = () => [];', FORM_NEXT, COLLECT_FORM].join('\n');
  assert.deepEqual(reflectRefusals(GUARD, changed), ['formNext', 'collectForm', 'collectForm']);
  const changedNext = [ENTRIES, 'const formNext = () => ({ done: true });', COLLECT_FORM].join(
    '\n'
  );
  assert.deepEqual(reflectRefusals(GUARD, changedNext), ['collectForm']);
});

test('L1 refuses each unchanged FormData iterator call that uses a changed capture', () => {
  assertRefusedCalls(GUARD, GUARD_SOURCE.replace(ENTRIES, 'const formEntries = () => [];'), [
    ['formNext', 'formEntries, new FormData()'],
    ['collectForm', 'formEntries, raw'],
    ['collectForm', 'formNext'],
  ]);
  assertRefusedCalls(GUARD, GUARD_SOURCE.replace(FORM_NEXT, 'const formNext = () => undefined;'), [
    ['collectForm', 'formNext'],
  ]);
});

for (const mutation of [
  "Object.defineProperty(FormData.prototype, 'getAll', { value: () => [] });",
  'Object.defineProperties(FormData.prototype, { getAll: { value: () => [] } });',
  "Object['assign'](FormData.prototype, { getAll: () => [] });",
  'Object.setPrototypeOf(FormData.prototype, null);',
  "Reflect.set(FormData.prototype, 'getAll', () => []);",
  "Reflect.defineProperty(FormData.prototype, 'getAll', { value: () => [] });",
  'globalThis.FormData.prototype.getAll = () => [];',
  'self.FormData = class {};',
  "window['FormData'].prototype.getAll = () => [];",
  "window['Form' + 'Data'].prototype.getAll = () => [];",
  'global.FormData.prototype = {};',
  'delete globalThis.FormData.prototype.getAll;',
  "Object.defineProperty(globalThis, 'FormData', { value: class {} });",
  "Object.defineProperty(Reflect, 'apply', { value: () => [] });",
  'Reflect.apply = () => [];',
  'const prototype = FormData.prototype; prototype.getAll = () => [];',
  'const globals = globalThis; globals.FormData = class {};',
  "Object.defineProperty(Object.getPrototypeOf(new FormData()), 'getAll', { value: () => [] });",
  "const form = new FormData(); Object.defineProperty(Object.getPrototypeOf(form), 'getAll', { value: () => [] });",
  "function replace(form) { Object.defineProperty(Object.getPrototypeOf(form), 'getAll', { value: () => [] }); } replace(new FormData());",
]) {
  test(`L1 refuses the unchanged call for a same-module mutation: ${mutation}`, () => {
    assertRefusedCalls(REFUSAL, [mutation, REFUSAL_SOURCE].join('\n'), [
      ['readRawValue', 'formGetAll'],
    ]);
    assertRefusedCalls(REFUSAL, [REFUSAL_SOURCE, mutation].join('\n'), [
      ['readRawValue', 'formGetAll'],
    ]);
  });
}

test('L1 refuses getter captures when their native descriptor reader can be replaced', () => {
  const mutation = "Object.defineProperty(Object, 'getOwnPropertyDescriptor', { value: fake });";
  assertRefusedCalls(CHECK_DEF, `${mutation}\n${CHECK_DEF_SOURCE}`, [
    ['regexDefinition', 'regExpSource'],
    ['regexDefinition', 'regExpFlags'],
  ]);
});
