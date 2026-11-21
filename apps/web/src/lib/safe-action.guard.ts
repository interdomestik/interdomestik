import { types } from 'node:util';
import type { z } from 'zod';

import {
  dateTime,
  denseArray,
  hasReadableFormDataPrototype,
  isOwnReadable,
  ownValue,
} from './safe-action.check-def';
import { refinementRun, type RefinementRun } from './safe-action.checks';
import { actionFailure, type ActionFailure } from './safe-action.failure';
import { exactParsedInput, privateFile, snapshotIssue } from './safe-action.output';
import { assertPristineObjectPrototype, isIntegrityError } from './safe-action.recheck';
import {
  ActionDefinitionError,
  captureSchema,
  issuesOf,
  MAX_INPUT_DEPTH,
  type SchemaCheckOptions,
} from './safe-action.schema';
import {
  fieldAt,
  formKind,
  hasFile,
  rebuildParser,
  type FieldKind,
  type Shape,
} from './safe-action.shape';

export {
  assertPristineObjectPrototype,
  isIntegrityError,
  ObjectPrototypeIntegrityError,
} from './safe-action.recheck';

export type GuardOutcome =
  | { kind: 'value'; value: unknown; snapshot: unknown }
  | { kind: 'invalid'; failure: ActionFailure; snapshot: unknown }
  | { kind: 'thrown'; error: unknown; snapshot: unknown }
  | { kind: 'defect'; snapshot: unknown };

type Invalid = Extract<GuardOutcome, { kind: 'invalid' }>;

export type InputGuard = {
  fieldKind(path: readonly string[]): FieldKind | undefined;
  run(raw: unknown, form: boolean): Promise<GuardOutcome>;
};

const MAX_NODES = 10000;
const BAD_SNAPSHOT = Symbol('invalid snapshot');
type FileSlot = { target: Record<string, unknown> | unknown[]; key: string | number; file: object };
type SnapshotWork = { remaining: number; files: FileSlot[]; allowFiles: boolean };

const formEntries = FormData.prototype.entries;
const formNext: ReturnType<FormData['entries']>['next'] = Object.getPrototypeOf(
  Reflect.apply(formEntries, new FormData(), [])
).next;
function invalid(path = '_root', issue = 'invalid_type', snapshot: unknown = null): Invalid {
  return {
    kind: 'invalid',
    snapshot,
    failure: actionFailure('VALIDATION_ERROR', undefined, { issues: { [path]: issue } }),
  };
}

function collectForm(
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
}

function put(target: FileSlot['target'], key: FileSlot['key'], value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function copyRaw(
  raw: unknown,
  target: FileSlot['target'],
  key: FileSlot['key'],
  work: SnapshotWork,
  depth: number
): void {
  if (depth > MAX_INPUT_DEPTH || --work.remaining < 0) throw BAD_SNAPSHOT;
  if (
    raw === null ||
    raw === undefined ||
    ['string', 'number', 'boolean', 'bigint'].includes(typeof raw)
  ) {
    put(target, key, raw);
    return;
  }
  if (typeof raw !== 'object' || !isOwnReadable(raw)) throw BAD_SNAPSHOT;
  const prototype = Object.getPrototypeOf(raw);
  if (prototype === Date.prototype || types.isDate(raw)) {
    const time = dateTime(raw);
    if (time === undefined) throw BAD_SNAPSHOT;
    put(target, key, new Date(time));
    return;
  }
  if (prototype === File.prototype) {
    if (!work.allowFiles) throw BAD_SNAPSHOT;
    work.files.push({ target, key, file: raw });
    return;
  }
  if (Array.isArray(raw)) {
    const values = denseArray(raw, work.remaining);
    if (!values) throw BAD_SNAPSHOT;
    const array: unknown[] = [];
    values.forEach((value, index) => copyRaw(value, array, index, work, depth + 1));
    put(target, key, array);
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) throw BAD_SNAPSHOT;
  const record: Record<string, unknown> = Object.create(null);
  const keys = Reflect.ownKeys(raw);
  if (keys.length > work.remaining) throw BAD_SNAPSHOT;
  for (const field of keys) {
    if (typeof field !== 'string') throw BAD_SNAPSHOT;
    copyRaw(ownValue(raw, field), record, field, work, depth + 1);
  }
  put(target, key, record);
}

type Snapshot = { snapshot: unknown } | { refusal: Invalid };
type SnapshotOptions = { fieldKind: InputGuard['fieldKind']; allowFiles: boolean };

async function snapshotOf(
  raw: unknown,
  form: boolean,
  { fieldKind, allowFiles }: SnapshotOptions
): Promise<Snapshot> {
  const output: Record<string, unknown> = Object.create(null);
  const work: SnapshotWork = { remaining: MAX_NODES, files: [], allowFiles };
  try {
    if (form) {
      const fields = collectForm(raw, fieldKind);
      if (fields.kind === 'invalid') return { refusal: fields };
      raw = fields.fields;
    }
    copyRaw(raw, output, 'root', work, 1);
    const copies = new Map<object, Promise<File | null>>();
    const files = work.files.length
      ? await Promise.all(
          work.files.map(({ file }) => {
            const copy = copies.get(file) ?? privateFile(file);
            copies.set(file, copy);
            return copy;
          })
        )
      : [];
    assertPristineObjectPrototype();
    for (const [index, file] of files.entries()) {
      if (file === null) return { refusal: invalid() };
      put(work.files[index].target, work.files[index].key, file);
    }
    return { snapshot: output.root };
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    assertPristineObjectPrototype();
    return { refusal: invalid() };
  }
}

async function runGuard(
  raw: unknown,
  form: boolean,
  snapshotOptions: SnapshotOptions,
  shape: Shape,
  parser: z.ZodType
): Promise<GuardOutcome> {
  assertPristineObjectPrototype();
  const owned = await snapshotOf(raw, form, snapshotOptions);
  assertPristineObjectPrototype();
  if ('refusal' in owned) return owned.refusal;
  const { snapshot } = owned;
  const issue = snapshotIssue(shape, snapshot);
  if (issue !== undefined) return invalid(issue, 'invalid_type', snapshot);
  const context = Object.assign(Object.create(null), {
    abortEarly: false,
    skipChecks: false,
    direction: 'forward',
    jitless: true,
    reportInput: false,
    error: undefined,
  });
  const refinements: RefinementRun = { thrown: null, defect: false };
  let result: Awaited<ReturnType<typeof parser.safeParseAsync>>;
  assertPristineObjectPrototype();
  try {
    result = await refinementRun.run(refinements, () => parser.safeParseAsync(snapshot, context));
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    assertPristineObjectPrototype();
    return { kind: 'thrown', error, snapshot };
  }
  assertPristineObjectPrototype();
  if (refinements.thrown) {
    const { error } = refinements.thrown;
    if (isIntegrityError(error)) throw error;
    return { kind: 'thrown', error, snapshot };
  }
  if (refinements.defect) return { kind: 'defect', snapshot };
  try {
    if (!result.success) {
      const outcome: Invalid = {
        kind: 'invalid',
        snapshot,
        failure: actionFailure('VALIDATION_ERROR', undefined, { issues: issuesOf(result.error) }),
      };
      assertPristineObjectPrototype();
      return outcome;
    }
    const copy = exactParsedInput(shape, snapshot, result.data);
    assertPristineObjectPrototype();
    if (copy.kind === 'invalid') return invalid(copy.path, 'invalid_type', snapshot);
    return copy.kind === 'defect' ? { kind: 'defect', snapshot } : { ...copy, snapshot };
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    assertPristineObjectPrototype();
    return { kind: 'defect', snapshot };
  }
}

export function buildInputGuard(input: unknown, options: SchemaCheckOptions): InputGuard {
  assertPristineObjectPrototype();
  const shape = captureSchema(input, options);
  assertPristineObjectPrototype();
  let parser: z.ZodType;
  try {
    parser = rebuildParser(shape);
  } catch {
    throw new ActionDefinitionError(
      options.operation,
      'the captured input schema cannot be rebuilt'
    );
  }
  assertPristineObjectPrototype();
  const fieldKind: InputGuard['fieldKind'] = path => {
    const node = fieldAt(shape, path);
    const kind = node && formKind(node);
    return kind === 'mixed' ? 'scalar' : kind;
  };
  const snapshotOptions = { fieldKind, allowFiles: hasFile(shape) };
  return Object.freeze({
    fieldKind,
    run: (raw: unknown, form: boolean) => runGuard(raw, form, snapshotOptions, shape, parser),
  });
}
