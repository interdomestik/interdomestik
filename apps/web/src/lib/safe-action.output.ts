import { types } from 'node:util';
import { z } from 'zod';

import {
  ACCESSOR,
  dateTime,
  denseArray,
  isOwnReadable,
  isSnapshotRecord,
  ownValue,
} from './safe-action.check-def';
import { assertPristineObjectPrototype, isIntegrityError } from './safe-action.recheck';
import type { ObjectShape, Shape } from './safe-action.shape';

export const formatSnapshotIssue: z.core.$ZodErrorMap = issue => {
  if (
    issue.code !== 'invalid_type' ||
    !isSnapshotRecord(issue.input) ||
    !Object.hasOwn(issue.input, 'constructor')
  ) {
    return undefined;
  }
  // Zod's locale maps infer the type from constructor.name on non-plain objects.
  // A plain copy for localization retains the fields without using the submitted constructor.
  const config = z.config();
  const { unwrapMessage } = z.core.util;
  return (
    unwrapMessage(config.customError?.(issue)) ??
    unwrapMessage(config.localeError?.({ ...issue, input: { ...issue.input } })) ??
    'Invalid input'
  );
};

type Slot = { key: PropertyKey; type: string; object?: ObjectLayout };
type ObjectLayout = { prototype: object | null; slots: Slot[] };

function referenceLayout(object: object, nested = false): ObjectLayout {
  return {
    prototype: Object.getPrototypeOf(object),
    slots: Reflect.ownKeys(object).map(key => {
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
}

const fileLayout = referenceLayout(new File([], ''));
const fileName = Object.getOwnPropertyDescriptor(File.prototype, 'name')!.get!;
const fileTime = Object.getOwnPropertyDescriptor(File.prototype, 'lastModified')!.get!;
const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type')!.get!;
const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
const blobBytes = Blob.prototype.arrayBuffer;

function matchesLayout(value: unknown, layout: ObjectLayout): boolean {
  if (
    !isOwnReadable(value) ||
    Object.getPrototypeOf(value) !== layout.prototype ||
    Reflect.ownKeys(value).length !== layout.slots.length
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
}

/** Validate the backing descriptors before starting any intrinsic read of the submitted File. */
export async function privateFile(value: unknown): Promise<File | null> {
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
}

type Copy =
  { kind: 'value'; value: unknown } | { kind: 'invalid'; path: string } | { kind: 'defect' };

const DEFECT = Object.freeze({ kind: 'defect' } as const);
const copied = (value: unknown): Copy => ({ kind: 'value', value });
const childPath = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));

type UnionShape = Extract<Shape, { type: 'union' }>;

function discriminatedBranch(shape: UnionShape, raw: unknown, discriminator: string) {
  const tag = ownValue(raw, discriminator);
  return shape.branches.find(candidate => {
    const field = candidate.type === 'object' ? candidate.fields[discriminator] : undefined;
    return (
      (field?.type === 'enum' || field?.type === 'literal') &&
      field.values.some(value => Object.is(value, tag) || value === tag)
    );
  });
}

export function snapshotIssue(shape: Shape, raw: unknown, path = ''): string | undefined {
  if ('inner' in shape) {
    if (
      (shape.type === 'nullable' && raw === null) ||
      (shape.type === 'optional' && raw === undefined)
    )
      return undefined;
    return snapshotIssue(shape.inner, raw, path);
  }
  if ('coerce' in shape && shape.coerce) {
    const type = typeof raw;
    const acceptable =
      type === 'string' ||
      type === 'number' ||
      type === 'boolean' ||
      (shape.type === 'bigint' && type === 'bigint');
    return acceptable ? undefined : path || '_root';
  }
  if (shape.type === 'object') {
    if (!isSnapshotRecord(raw)) return path || '_root';
    for (const [key, field] of Object.entries(shape.fields)) {
      const issue = snapshotIssue(field, ownValue(raw, key), childPath(path, key));
      if (issue !== undefined) return issue;
    }
  }
  if (shape.type === 'union' && shape.discriminator !== null) {
    if (!isSnapshotRecord(raw)) return path || '_root';
    const branch = discriminatedBranch(shape, raw, shape.discriminator);
    if (branch) return snapshotIssue(branch, raw, path);
  }
  if ((shape.type === 'array' || shape.type === 'tuple') && Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 1) {
      const field = shape.type === 'array' ? shape.element : shape.items[i];
      if (!field) continue;
      const issue = snapshotIssue(field, ownValue(raw, i), childPath(path, i));
      if (issue !== undefined) return issue;
    }
  }
  return undefined;
}

function withFrozenState<T extends object>(source: object, copy: T): Copy {
  return copied(Object.isFrozen(source) ? Object.freeze(copy) : copy);
}

function copyObject(shape: ObjectShape, raw: unknown, parsed: unknown, path: string): Copy {
  if (!isOwnReadable(parsed) || Array.isArray(parsed)) return DEFECT;
  const prototype = Object.getPrototypeOf(parsed);
  if (prototype !== null && prototype !== Object.prototype) return DEFECT;
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(parsed)) {
    if (typeof key !== 'string' || !Object.hasOwn(shape.fields, key)) return DEFECT;
    const field = shape.fields[key];
    const next = childPath(path, key);
    if (!isOwnReadable(raw)) return DEFECT;
    if (!Object.hasOwn(raw, key)) return { kind: 'invalid', path: next };
    const value = ownValue(parsed, key);
    const rawValue = ownValue(raw, key);
    if (value === ACCESSOR || rawValue === ACCESSOR) return DEFECT;
    const result = exactParsedInput(field, rawValue, value, next);
    if (result.kind !== 'value') return result;
    Object.defineProperty(copy, key, {
      value: result.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  for (const [key, field] of Object.entries(shape.fields)) {
    if (Object.hasOwn(copy, key)) continue;
    if (
      key in copy ||
      exactParsedInput(field, undefined, undefined, childPath(path, key)).kind !== 'value'
    )
      return DEFECT;
  }
  return withFrozenState(parsed, copy);
}

function copyArray(
  shape: Extract<Shape, { type: 'array' | 'tuple' }>,
  raw: unknown,
  parsed: unknown,
  path: string
): Copy {
  const values = denseArray(parsed, 10000);
  const source = denseArray(raw, 10000);
  if (!values || !source || !Array.isArray(parsed)) return DEFECT;
  const count = shape.type === 'tuple' ? shape.items.length : values.length;
  if (values.length > count) return DEFECT;
  const copy: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const field = shape.type === 'array' ? shape.element : shape.items[index];
    const key = childPath(path, index);
    if (index < values.length && index >= source.length) return { kind: 'invalid', path: key };
    const result = exactParsedInput(field, source[index], values[index], key);
    if (result.kind !== 'value') return result;
    if (index < values.length) copy.push(result.value);
  }
  return withFrozenState(parsed, copy);
}

function copyUnion(shape: UnionShape, raw: unknown, parsed: unknown, path: string): Copy {
  if (shape.discriminator !== null) {
    const branch = discriminatedBranch(shape, raw, shape.discriminator);
    return branch ? exactParsedInput(branch, raw, parsed, path) : DEFECT;
  }
  for (const branch of shape.branches) {
    const result = exactParsedInput(branch, raw, parsed, path);
    if (result.kind !== 'defect') return result;
  }
  return DEFECT;
}

export function exactParsedInput(shape: Shape, raw: unknown, parsed: unknown, path = ''): Copy {
  switch (shape.type) {
    case 'optional':
      return parsed === undefined
        ? copied(parsed)
        : exactParsedInput(shape.inner, raw, parsed, path);
    case 'nullable':
      return parsed === null ? copied(parsed) : exactParsedInput(shape.inner, raw, parsed, path);
    case 'readonly':
      return exactParsedInput(shape.inner, raw, parsed, path);
    case 'object':
      return copyObject(shape, raw, parsed, path);
    case 'array':
    case 'tuple':
      return copyArray(shape, raw, parsed, path);
    case 'union':
      return copyUnion(shape, raw, parsed, path);
    case 'enum':
    case 'literal':
      return shape.values.some(value => Object.is(value, parsed) || value === parsed)
        ? copied(parsed)
        : DEFECT;
    case 'date': {
      const time = dateTime(parsed);
      return time === undefined ? DEFECT : withFrozenState(parsed as Date, new Date(time));
    }
    case 'file':
      return parsed === raw && matchesLayout(parsed, fileLayout) ? copied(parsed) : DEFECT;
    default:
      return typeof parsed === shape.type ? copied(parsed) : DEFECT;
  }
}
