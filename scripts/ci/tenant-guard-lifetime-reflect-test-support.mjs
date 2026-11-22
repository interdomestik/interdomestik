import assert from 'node:assert/strict';
import { run } from './tenant-guard-test-support.mjs';

export const CHECK_DEF = 'apps/web/src/lib/safe-action.check-def.ts';
export const OUTPUT = 'apps/web/src/lib/safe-action.output.ts';
export const REFUSAL = 'apps/web/src/lib/safe-action.refusal.ts';
export const GUARD = 'apps/web/src/lib/safe-action.guard.ts';
export const ENTRIES = 'const formEntries = FormData.prototype.entries;';
export const GET_ALL = 'const formGetAll = FormData.prototype.getAll;';
export const FORM_NEXT = `const formNext: ReturnType<FormData['entries']>['next'] = Object.getPrototypeOf(
  Reflect.apply(formEntries, new FormData(), [])
).next;`;
export const COLLECT_FORM = `function collectForm(
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
export const READ_RAW_VALUE = `function readRawValue(
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
export const REFUSAL_SOURCE = [GET_ALL, READ_RAW_VALUE].join('\n');
export const BLOB_SIZE =
  "const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;";
export const FILE_NAME =
  "const fileName = Object.getOwnPropertyDescriptor(File.prototype, 'name')!.get!;";
export const BLOB_TYPE =
  "const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type')!.get!;";
export const FILE_TIME =
  "const fileTime = Object.getOwnPropertyDescriptor(File.prototype, 'lastModified')!.get!;";
export const BLOB_BYTES = 'const blobBytes = Blob.prototype.arrayBuffer;';
export const REFERENCE_LAYOUT = `function referenceLayout(object: object, nested = false): ObjectLayout {
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
export const FILE_LAYOUT = "const fileLayout = referenceLayout(new File([], ''));";
export const MATCHES_LAYOUT = `function matchesLayout(value: unknown, layout: ObjectLayout): boolean {
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
export const GUARD_SOURCE = [ENTRIES, FORM_NEXT, COLLECT_FORM].join('\n');
export const OUTPUT_SOURCE = [
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
export const LAYOUT_IMPORT_SOURCE = `
export const ACCESSOR = Symbol();
export function isOwnReadable() { return true; }
export function ownKeys() { return []; }
export function ownValue() { return undefined; }
`;

function reflectViolations(file, source, siblings) {
  return run({ ...siblings, [file]: source }).violations.filter(
    v =>
      v.file === file &&
      v.rule === 'L1' &&
      v.detail.endsWith('a Reflect operation other than has or ownKeys')
  );
}

export function reflectRefusals(file, source) {
  return reflectViolations(file, source).map(v => v.unit);
}

export function assertRefusedCalls(file, source, calls, siblings) {
  const lines = source.split('\n');
  const expected = calls.map(([unit, argumentsStart]) => {
    const line = lines.findIndex(text => text.includes(`Reflect.apply(${argumentsStart},`));
    assert.ok(line >= 0, `fixture must contain the unchanged call starting with ${argumentsStart}`);
    return { unit, line: line + 1 };
  });
  // A mutation can be refused in its own right. Require the refusal at each calling unit as well.
  const units = new Set(expected.map(site => site.unit));
  const refused = reflectViolations(file, source, siblings)
    .filter(v => units.has(v.unit))
    .map(({ unit, line }) => ({ unit, line }));
  assert.deepEqual(refused, expected);
}
