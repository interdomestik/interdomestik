import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from './tenant-guard-test-support.mjs';
import { LIFETIME_REFLECT_ADMISSIONS } from './tenant-guard/lifetime-reflect-admissions.mjs';

const CHECK_DEF = 'apps/web/src/lib/safe-action.check-def.ts';
const OUTPUT = 'apps/web/src/lib/safe-action.output.ts';
const REFUSAL = 'apps/web/src/lib/safe-action.refusal.ts';
const GUARD = 'apps/web/src/lib/safe-action.guard.ts';
const ENTRIES = 'const formEntries = FormData.prototype.entries;';
const GET_ALL = 'const formGetAll = FormData.prototype.getAll;';
const FORM_NEXT = `const formNext: ReturnType<FormData['entries']>['next'] = Object.getPrototypeOf(
  Reflect.apply(formEntries, new FormData(), [])
).next;`;
const COLLECT_FORM = `function collectForm(
  raw: unknown,
  kind: InputGuard['fieldKind']
): { kind: 'form'; fields: Record<string, unknown> } | Invalid {
  if (!hasReadableFormDataPrototype(raw)) return invalid();
  const input: Record<string, unknown> = Object.create(null);
  const iterator = Reflect.apply(formEntries, raw, []);
  let count = 0;
  for (;;) {
    const entry = Reflect.apply(formNext, iterator, []);
    if (entry.done) return { kind: 'form', fields: input };
    count += 1;
    if (count > MAX_NODES) return invalid();
    const [key, value] = entry.value;
    if (key.startsWith('$ACTION_')) continue;
    if (kind([key]) === 'array') {
      input[key] ??= [] as FormDataEntryValue[];
      (input[key] as FormDataEntryValue[]).push(value);
    } else {
      if (Object.hasOwn(input, key)) return invalid(key, 'duplicate_field');
      input[key] = value;
    }
  }
}`;
const READ_RAW_VALUE = `function readRawValue(
  rawInput: unknown,
  from: string,
  form: boolean,
  snapshotted: boolean
): unknown {
  if (form && !snapshotted) {
    if (!hasReadableFormDataPrototype(rawInput)) return undefined;
    const values: FormDataEntryValue[] = Reflect.apply(formGetAll, rawInput, [from]);
    return values.length === 1 ? values[0] : undefined;
  }
  if (typeof rawInput !== 'object') return undefined;
  const value = ownValue(rawInput, from);
  if (form && isOwnReadable(value) && Array.isArray(value)) {
    return ownValue(value, 'length') === 1 ? ownValue(value, 0) : undefined;
  }
  return value;
}`;
const REFUSAL_SOURCE = [GET_ALL, READ_RAW_VALUE].join('\n');
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
const BLOB_SIZE = "const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;";
const FILE_NAME = "const fileName = Object.getOwnPropertyDescriptor(File.prototype, 'name')!.get!;";
const BLOB_TYPE = "const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type')!.get!;";
const FILE_TIME =
  "const fileTime = Object.getOwnPropertyDescriptor(File.prototype, 'lastModified')!.get!;";
const BLOB_BYTES = 'const blobBytes = Blob.prototype.arrayBuffer;';
const REFERENCE_LAYOUT = `function referenceLayout(object: object, nested = false): ObjectLayout {
  return {
    prototype: Object.getPrototypeOf(object),
    slots: ownKeys(object).map(key => {
      const value = ownValue(object, key);
      return {
        key,
        type: typeof value,
        ...(!nested && value !== null && typeof value === 'object'
          ? { object: referenceLayout(value, true) }
          : {}),
      };
    }),
  };
}`;
const FILE_LAYOUT = "const fileLayout = referenceLayout(new File([], ''));";
const MATCHES_LAYOUT = `function matchesLayout(value: unknown, layout: ObjectLayout): boolean {
  if (
    !isOwnReadable(value) ||
    Object.getPrototypeOf(value) !== layout.prototype ||
    ownKeys(value).length !== layout.slots.length
  )
    return false;
  return layout.slots.every(slot => {
    const field = ownValue(value, slot.key);
    return (
      Object.hasOwn(value, slot.key) &&
      field !== ACCESSOR &&
      typeof field === slot.type &&
      (slot.object === undefined || matchesLayout(field, slot.object))
    );
  });
}`;
const PRIVATE_FILE = `export async function privateFile(value: unknown): Promise<File | null> {
  try {
    if (!matchesLayout(value, fileLayout)) return null;
    const size = Reflect.apply(blobSize, value, []);
    const name = Reflect.apply(fileName, value, []);
    const options = {
      __proto__: null,
      type: Reflect.apply(blobType, value, []),
      lastModified: Reflect.apply(fileTime, value, []),
    };
    const bytes: unknown = await Reflect.apply(blobBytes, value, []);
    assertPristineObjectPrototype();
    if (!types.isArrayBuffer(bytes) || size !== bytes.byteLength) return null;
    return new File([bytes], name, options);
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    assertPristineObjectPrototype();
    return null;
  }
}`;
const CHECK_DEF_SOURCE = [REGEXP_SOURCE, REGEXP_FLAGS, REGEX_DEFINITION].join('\n');
const GUARD_SOURCE = [ENTRIES, FORM_NEXT, COLLECT_FORM].join('\n');
const OUTPUT_SOURCE = [
  "import { ACCESSOR, isOwnReadable, ownKeys, ownValue } from './safe-action.check-def';",
  REFERENCE_LAYOUT,
  FILE_LAYOUT,
  BLOB_SIZE,
  FILE_NAME,
  BLOB_TYPE,
  FILE_TIME,
  BLOB_BYTES,
  MATCHES_LAYOUT,
  PRIVATE_FILE,
  'function exactCopy(value: unknown) { return matchesLayout(value, fileLayout); }',
].join('\n');
const LAYOUT_IMPORT_SOURCE = `
export const ACCESSOR = Symbol();
export function isOwnReadable() { return true; }
export function ownKeys() { return []; }
export function ownValue() { return undefined; }
`;

function reflectViolations(file, source) {
  return run({ [file]: source }).violations.filter(
    v =>
      v.file === file &&
      v.rule === 'L1' &&
      v.detail.endsWith('a Reflect operation other than has or ownKeys')
  );
}

function reflectRefusals(file, source) {
  return reflectViolations(file, source).map(v => v.unit);
}

function assertRefusedCalls(file, source, calls) {
  const lines = source.split('\n');
  const expected = calls.map(([unit, argumentsStart]) => {
    const line = lines.findIndex(text => text.includes(`Reflect.apply(${argumentsStart},`));
    assert.ok(line >= 0, `fixture must contain the unchanged call starting with ${argumentsStart}`);
    return { unit, line: line + 1 };
  });
  // A mutation can be refused in its own right. Require the refusal at each calling unit as well.
  const units = new Set(expected.map(site => site.unit));
  const refused = reflectViolations(file, source)
    .filter(v => units.has(v.unit))
    .map(({ unit, line }) => ({ unit, line }));
  assert.deepEqual(refused, expected);
}

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
