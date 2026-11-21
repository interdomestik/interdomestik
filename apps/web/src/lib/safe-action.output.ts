import { types } from 'node:util';

import { ACCESSOR, denseArray, isOwnReadable, ownValue } from './safe-action.check-def';
import { dateTime } from './safe-action.checks';
import { assertPristineObjectPrototype, isIntegrityError } from './safe-action.recheck';
import type { ObjectShape, Shape } from './safe-action.shape';

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

function copyUnion(
  shape: Extract<Shape, { type: 'union' }>,
  raw: unknown,
  parsed: unknown,
  path: string
): Copy {
  if (shape.discriminator !== null) {
    const tag = ownValue(raw, shape.discriminator);
    const branch = shape.branches.find(candidate => {
      if (candidate.type !== 'object') return false;
      const field = candidate.fields[shape.discriminator!];
      return (
        (field?.type === 'enum' || field?.type === 'literal') &&
        field.values.some(value => Object.is(value, tag) || value === tag)
      );
    });
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
