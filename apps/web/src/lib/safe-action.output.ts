import type { z } from 'zod';

import { ActionDefinitionError } from './safe-action.schema';

// The parsed value a handler receives must still have the declared shape (Astra r2 B03). The
// definition walk accepts scalar normalizers (trim, toLowerCase), which zod 4 builds as `overwrite`
// closures indistinguishable from caller code; an overwrite on a scalar could return an object with
// undeclared keys. This walk runs after every successful parse, before the handler.
type Def = {
  type: string;
  shape?: Record<string, z.ZodType>;
  innerType?: z.ZodType;
  element?: z.ZodType;
  items?: z.ZodType[];
  options?: z.ZodType[];
};

const defOf = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;

const PRIMITIVE: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  bigint: 'bigint',
};

const isPrimitive = (value: unknown) =>
  value === null || (typeof value !== 'object' && typeof value !== 'function');

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

function objectConforms(def: Def, value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const shape = def.shape ?? {};
  if (Object.keys(value).some(key => !Object.hasOwn(shape, key))) return false;
  return Object.entries(shape).every(([key, child]) => conforms(child, value[key]));
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
      return Array.isArray(value) && value.every(item => conforms(def.element as z.ZodType, item));
    case 'tuple': {
      const items = def.items ?? [];
      return (
        Array.isArray(value) &&
        value.length === items.length &&
        items.every((item, index) => conforms(item, value[index]))
      );
    }
    case 'union':
      return (def.options ?? []).some(option => conforms(option, value));
    case 'date':
      return value instanceof Date;
    case 'file':
      return value instanceof Blob;
    case 'enum':
    case 'literal':
      return isPrimitive(value);
    default:
      return def.type in PRIMITIVE && typeof value === PRIMITIVE[def.type];
  }
}

/** Throws unless `value` has exactly the shape the accepted schema declares. */
export function assertParsedShape(schema: z.ZodType, value: unknown, operation: string): void {
  if (!conforms(schema, value)) {
    throw new ActionDefinitionError(
      operation,
      'the parsed input does not have the declared shape (a scalar overwrite returned another type)'
    );
  }
}
