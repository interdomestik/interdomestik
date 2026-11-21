import { types } from 'node:util';

export const ACCESSOR = Symbol('accessor');

export function isOwnReadable(value: unknown): value is object {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    !types.isProxy(value)
  );
}

/** Enumerate all own keys of a non-proxy, including non-enumerable and symbol keys. */
export function ownKeys(value: object): (string | symbol)[] {
  return [...Object.getOwnPropertyNames(value), ...Object.getOwnPropertySymbols(value)];
}

/** The snapshot copies own-data records with a null prototype. */
export function isSnapshotRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && isOwnReadable(value) && Object.getPrototypeOf(value) === null;
}

const formDataPrototype = FormData.prototype;
const asyncFunctionPrototype = Object.getPrototypeOf(async () => {});

/** Check the prototype chain before invoking a FormData intrinsic's brand check. */
export function hasReadableFormDataPrototype(value: unknown): boolean {
  for (
    let candidate = value;
    isOwnReadable(candidate);
    candidate = Object.getPrototypeOf(candidate)
  ) {
    if (candidate === formDataPrototype) return true;
  }
  return false;
}

export function dateTime(value: unknown): number | undefined {
  if (
    !types.isDate(value) ||
    Object.getPrototypeOf(value) !== Date.prototype ||
    ownKeys(value).length !== 0
  )
    return undefined;
  const time = Date.prototype.getTime.call(value);
  return Number.isFinite(time) ? time : undefined;
}

export function ownValue(holder: unknown, key: PropertyKey): unknown {
  if (!isOwnReadable(holder)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(holder, key);
  if (descriptor === undefined) return undefined;
  return Object.hasOwn(descriptor, 'value') ? descriptor.value : ACCESSOR;
}

export function isThenableLike(value: unknown): boolean {
  if (types.isPromise(value)) return true;
  for (
    let part = value;
    part !== Object.prototype &&
    part !== null &&
    (typeof part === 'object' || typeof part === 'function');
    part = Object.getPrototypeOf(part)
  ) {
    if (types.isProxy(part) || Object.hasOwn(part, 'then')) return true;
  }
  return false;
}

export function isAsyncCallback(value: unknown): boolean {
  if (types.isAsyncFunction(value)) return true;
  if (typeof value !== 'function') return false;
  // Bound async callbacks retain this prototype but lose the native async brand.
  for (let part: unknown = value; isOwnReadable(part); part = Object.getPrototypeOf(part)) {
    if (part === asyncFunctionPrototype) return true;
  }
  return false;
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
  if (typeof length !== 'number' || length > maxLength || ownKeys(value).length !== length + 1)
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

/** Capture the own data fields of a check definition. */
export function checkDef(
  check: unknown,
  def = schemaDef(check)
): Readonly<Record<PropertyKey, unknown>> | null {
  if (def === null) return null;
  const capture: Record<PropertyKey, unknown> = Object.create(null);
  for (const key of ownKeys(def)) {
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

const patternedFormats = new Set([
  'regex',
  'lowercase',
  'uppercase',
  'email',
  'uuid',
  'guid',
  'cuid',
  'cuid2',
  'ulid',
  'nanoid',
  'xid',
  'ksuid',
  'ipv4',
  'cidrv4',
  'e164',
  'date',
  'time',
  'datetime',
  'duration',
  'emoji',
]);
const regExpSource = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')!.get!;
const regExpFlags = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags')!.get!;

export function regexDefinition(
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
  return [Reflect.apply(regExpSource, pattern, []), Reflect.apply(regExpFlags, pattern, [])];
}

function carriesSchema(value: unknown): boolean {
  while (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    if (types.isProxy(value) || Object.hasOwn(value, '_zod')) return true;
    value = Object.getPrototypeOf(value);
  }
  return false;
}

export function holdsSchema(def: Readonly<Record<PropertyKey, unknown>>): boolean {
  return ownKeys(def).some(key => carriesSchema(def[key]));
}

/** Read the raw shape before Zod's lazy getter can spread it. */
export function rawObjectShape(def: object): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(def, 'shape');
  return descriptor && !Object.hasOwn(descriptor, 'value')
    ? ownValue(descriptor.get, 'raw')
    : descriptor?.value;
}

function hasAsyncTransform(def: unknown): boolean {
  return isAsyncCallback(ownValue(def, 'transform'));
}

export function asyncSchemaReason(def: object, type: string): string | undefined {
  if (type === 'promise') return 'Promise schemas require async parsing';
  if (
    (type === 'transform' && hasAsyncTransform(def)) ||
    (type === 'pipe' &&
      (hasAsyncTransform(def) ||
        ['in', 'out'].some(side => hasAsyncTransform(schemaDef(ownValue(def, side))))))
  ) {
    return 'async transforms are not supported';
  }
  return undefined;
}
