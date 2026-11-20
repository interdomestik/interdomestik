import type { z } from 'zod';

import { ActionDefinitionError } from './safe-action.schema';

// The value a handler receives: a fresh copy of the parsed value with exactly the declared shape
// (Astra r2 B03, r3 B03 and B14, r5 B19 and B20). The definition walk accepts only checks that cannot
// change a value, plus the named normalisers; this walk runs after every successful parse, before the
// handler, as the second line. It reads own properties only, and the copy it returns holds only the
// declared keys present in the parsed value, in objects without a prototype, so an omitted optional
// key named like an Object.prototype member reads as undefined.
type Def = {
  type: string;
  shape?: Record<string, z.ZodType>;
  innerType?: z.ZodType;
  element?: z.ZodType;
  items?: z.ZodType[];
  options?: z.ZodType[];
  values?: unknown[];
};

const defOf = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;

const PRIMITIVE: Readonly<Record<string, string>> = Object.freeze({
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  bigint: 'bigint',
});

// An instance of exactly `proto` with no own string-named property.
const isBare = (value: unknown, proto: object) =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === proto &&
  Object.getOwnPropertyNames(value).length === 0;

// The own keys of a real File in this runtime (Node's File carries symbol-keyed internals).
let fileKeys: ReadonlySet<PropertyKey> | null = null;
const realFileKeys = (): ReadonlySet<PropertyKey> =>
  (fileKeys ??= new Set(Reflect.ownKeys(new File([], 'x'))));

// A File as zod's z.file() accepts it, with exactly a real File's own keys: no added key of any
// kind, string or symbol, and never a plain Blob (r5 B19).
function isRealFile(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (Object.getPrototypeOf(value) !== File.prototype) return false;
  const keys = Reflect.ownKeys(value);
  const expected = realFileKeys();
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

// A real, valid Date: exact prototype, no own string-named key, the Date tag, and `getTime` (which
// throws on anything without a Date's internal time value, whatever its tag says) (r4 B03).
function isRealDate(value: unknown): boolean {
  if (!isBare(value, Date.prototype)) return false;
  if (Object.prototype.toString.call(value) !== '[object Date]') return false;
  try {
    return !Number.isNaN(Date.prototype.getTime.call(value));
  } catch {
    return false;
  }
}

const INDEX = /^(?:0|[1-9]\d*)$/u;

// A plain array with every index present and no own key but its indices and `length`, each checked
// on its own rather than by count (r4 B03).
function isPlainArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  for (let index = 0; index < value.length; index += 1)
    if (!Object.hasOwn(value, index)) return false;
  return Reflect.ownKeys(value).every(
    key =>
      key === 'length' || (typeof key === 'string' && INDEX.test(key) && Number(key) < value.length)
  );
}

// zod's declared option values: for a numeric TypeScript enum, the numbers and not the reverse
// labels that `entries` also holds (r4 B03).
function enumOptions(schema: z.ZodType): readonly unknown[] {
  const options = (schema as unknown as { options?: unknown }).options;
  return Array.isArray(options) ? options : [];
}

// Marks a value that does not conform; never a parsed value.
const NO = Symbol('nonconforming');
type Copy = unknown;

const own = (value: object, key: string): unknown => (value as Record<string, unknown>)[key];

function copyObject(def: Def, value: unknown): Copy {
  if (value === null || typeof value !== 'object') return NO;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return NO;
  const shape = def.shape ?? {};
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !Object.hasOwn(shape, key)))
    return NO;
  const copy: Record<string, unknown> = Object.create(null);
  for (const [key, child] of Object.entries(shape)) {
    const present = Object.hasOwn(value, key);
    const item = copyOf(child, present ? own(value, key) : undefined);
    if (item === NO) return NO;
    if (present) copy[key] = item;
  }
  return copy;
}

function copyArray(element: z.ZodType, value: unknown): Copy {
  if (!isPlainArray(value)) return NO;
  const copy: unknown[] = [];
  for (const item of value) {
    const next = copyOf(element, item);
    if (next === NO) return NO;
    copy.push(next);
  }
  return copy;
}

// Items past the end are absent: only an optional item may be absent.
function copyTuple(def: Def, value: unknown): Copy {
  const items = def.items ?? [];
  if (!isPlainArray(value) || value.length > items.length) return NO;
  const copy: unknown[] = [];
  for (const [index, item] of items.entries()) {
    const next = copyOf(item, index < value.length ? value[index] : undefined);
    if (next === NO) return NO;
    if (index < value.length) copy.push(next);
  }
  return copy;
}

function copyUnion(def: Def, value: unknown): Copy {
  for (const option of def.options ?? []) {
    const copy = copyOf(option, value);
    if (copy !== NO) return copy;
  }
  return NO;
}

const scalar = (ok: boolean, value: unknown): Copy => (ok ? value : NO);

function copyOf(schema: z.ZodType, value: unknown): Copy {
  const def = defOf(schema);
  switch (def.type) {
    case 'optional':
      return value === undefined ? value : copyOf(def.innerType as z.ZodType, value);
    case 'nullable':
      return value === null ? value : copyOf(def.innerType as z.ZodType, value);
    case 'readonly': {
      const copy = copyOf(def.innerType as z.ZodType, value);
      return copy !== NO && typeof copy === 'object' && copy !== null ? Object.freeze(copy) : copy;
    }
    case 'object':
      return copyObject(def, value);
    case 'array':
      return copyArray(def.element as z.ZodType, value);
    case 'tuple':
      return copyTuple(def, value);
    case 'union':
      return copyUnion(def, value);
    case 'date':
      return scalar(isRealDate(value), value);
    case 'file':
      return scalar(isRealFile(value), value);
    case 'enum':
      return scalar(enumOptions(schema).includes(value), value);
    case 'literal':
      return scalar((def.values ?? []).includes(value), value);
    default:
      return scalar(
        Object.hasOwn(PRIMITIVE, def.type) && typeof value === PRIMITIVE[def.type],
        value
      );
  }
}

/**
 * The value the handler receives: a fresh copy of `value` with exactly the declared shape. Throws
 * when the parsed value does not conform.
 */
export function exactParsedInput(schema: z.ZodType, value: unknown, operation: string): unknown {
  const copy = copyOf(schema, value);
  if (copy === NO) {
    throw new ActionDefinitionError(
      operation,
      'the parsed input does not have the declared shape (a check changed the value)'
    );
  }
  return copy;
}
