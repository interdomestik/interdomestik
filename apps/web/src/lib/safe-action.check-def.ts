import { types } from 'node:util';

export const ACCESSOR = Symbol('accessor');

export function isOwnReadable(value: unknown): value is object {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    !types.isProxy(value)
  );
}

export function ownValue(holder: unknown, key: PropertyKey): unknown {
  if (!isOwnReadable(holder)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(holder, key);
  if (descriptor === undefined) return undefined;
  return Object.hasOwn(descriptor, 'value') ? descriptor.value : ACCESSOR;
}

/** Reads a dense, ordinary array without consulting its iterator or its inherited properties. */
export function denseArray(value: unknown, maxLength: number): unknown[] | null {
  if (
    !isOwnReadable(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    return null;
  const length = ownValue(value, 'length');
  if (
    typeof length !== 'number' ||
    length > maxLength ||
    Reflect.ownKeys(value).length !== length + 1
  )
    return null;
  const copy: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) return null;
    const item = ownValue(value, index);
    if (item === ACCESSOR) return null;
    copy.push(item);
  }
  return copy;
}

export function schemaDef(schema: unknown): Readonly<Record<PropertyKey, unknown>> | null {
  const def = ownValue(ownValue(schema, '_zod'), 'def');
  return isOwnReadable(def) && Object.getPrototypeOf(def) === Object.prototype
    ? (def as Readonly<Record<PropertyKey, unknown>>)
    : null;
}

/** The captured definition of a check. The only deliberately read schema getter is object shape. */
export function checkDef(
  check: unknown,
  def = schemaDef(check)
): Readonly<Record<PropertyKey, unknown>> | null {
  if (def === null) return null;
  const capture: Record<PropertyKey, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(def)) {
    const value = ownValue(def, key);
    if (value === ACCESSOR) return null;
    capture[key] = value;
  }
  return capture;
}

export function hasTrait(schema: unknown, trait: string): boolean {
  const traits = ownValue(ownValue(schema, '_zod'), 'traits');
  return types.isSet(traits) && Set.prototype.has.call(traits, trait);
}

function carriesSchema(value: unknown): boolean {
  while (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    if (types.isProxy(value) || Object.hasOwn(value, '_zod')) return true;
    value = Object.getPrototypeOf(value);
  }
  return false;
}

export function holdsSchema(def: Readonly<Record<PropertyKey, unknown>>): boolean {
  return Reflect.ownKeys(def).some(key => carriesSchema(def[key]));
}
