import type { z } from 'zod';

import { ActionDefinitionError } from './safe-action.schema';

// The parsed value a handler receives must have exactly the declared shape (Astra r2 B03, r3 B03 and
// B14). The definition walk accepts scalar normalizers (trim, toLowerCase), which zod 4 builds as
// `overwrite` closures indistinguishable from caller code; an overwrite could return another type or
// an object carrying undeclared keys. This walk runs after every successful parse, before the
// handler, and reads own properties only.
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

const ownValue = (value: object, key: string): unknown =>
  Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;

// An instance of exactly one of `protos` with no own string-named property (a Date, a File, a Blob).
// The runtime's own symbol-keyed internals (Node's File carries several) are not input keys.
const isBare = (value: unknown, ...protos: object[]) =>
  typeof value === 'object' &&
  value !== null &&
  protos.includes(Object.getPrototypeOf(value)) &&
  Object.getOwnPropertyNames(value).length === 0;

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

function objectConforms(def: Def, value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const shape = def.shape ?? {};
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !Object.hasOwn(shape, key)))
    return false;
  return Object.entries(shape).every(([key, child]) => conforms(child, ownValue(value, key)));
}

// Items past the end are absent: only an optional item may be absent.
function tupleConforms(def: Def, value: unknown): boolean {
  const items = def.items ?? [];
  if (!isPlainArray(value) || value.length > items.length) return false;
  return items.every((item, index) => conforms(item, value[index]));
}

function conforms(schema: z.ZodType, value: unknown): boolean {
  const def = defOf(schema);
  switch (def.type) {
    case 'optional':
      return value === undefined || conforms(def.innerType as z.ZodType, value);
    case 'nullable':
      return value === null || conforms(def.innerType as z.ZodType, value);
    case 'readonly':
      return conforms(def.innerType as z.ZodType, value);
    case 'object':
      return objectConforms(def, value);
    case 'array':
      return isPlainArray(value) && value.every(item => conforms(def.element as z.ZodType, item));
    case 'tuple':
      return tupleConforms(def, value);
    case 'union':
      return (def.options ?? []).some(option => conforms(option, value));
    case 'date':
      return isRealDate(value);
    case 'file':
      return isBare(value, File.prototype, Blob.prototype);
    case 'enum':
      return enumOptions(schema).includes(value);
    case 'literal':
      return (def.values ?? []).includes(value);
    default:
      return Object.hasOwn(PRIMITIVE, def.type) && typeof value === PRIMITIVE[def.type];
  }
}

/** Throws unless `value` has exactly the shape the accepted schema declares. */
export function assertParsedShape(schema: z.ZodType, value: unknown, operation: string): void {
  if (!conforms(schema, value)) {
    throw new ActionDefinitionError(
      operation,
      'the parsed input does not have the declared shape (a scalar overwrite returned another value)'
    );
  }
}
