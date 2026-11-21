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

function reflectRefusals(file, source) {
  return run({ [file]: source })
    .violations.filter(
      v =>
        v.file === file &&
        v.rule === 'L1' &&
        v.detail.endsWith('a Reflect operation other than has or ownKeys')
    )
    .map(v => v.unit);
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
  assert.deepEqual(
    run({ [REFUSAL]: REFUSAL_SOURCE, [GUARD]: [ENTRIES, FORM_NEXT, COLLECT_FORM].join('\n') })
      .violations,
    []
  );
});

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
