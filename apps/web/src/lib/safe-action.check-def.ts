import { z } from 'zod';

// Reading a zod check's definition for the input-schema walk (`safe-action.schema.ts`): from property
// descriptors only, so nothing of a hand-built definition is called (addenda 7 to 9).
// An own property from its descriptor; an accessor (no `value`) is never called (r10 B28).
const ACCESSOR = Symbol('accessor');
export function ownValue(holder: unknown, key: PropertyKey): unknown {
  if ((typeof holder !== 'object' && typeof holder !== 'function') || holder === null) {
    return undefined;
  }
  // Object's form, called in place: the tenant guard admits Reflect's has and ownKeys only.
  const own = Object.getOwnPropertyDescriptor(holder, key);
  if (own === undefined) return undefined;
  return 'value' in own ? own.value : ACCESSOR;
}

// `check._zod.def` through own data properties, or null when a step or any own key is an accessor or
// its prototype is not Object.prototype (zod would read an inherited `when`); nothing is called.
export function checkDef(check: unknown): Readonly<Record<PropertyKey, unknown>> | null {
  const def = ownValue(ownValue(check, '_zod'), 'def');
  if (typeof def !== 'object' || def === null || Object.getPrototypeOf(def) !== Object.prototype) {
    return null;
  }
  const keys = Reflect.ownKeys(def);
  if (keys.some(key => ownValue(def, key) === ACCESSOR)) return null;
  return def as Readonly<Record<PropertyKey, unknown>>;
}

const firstCheck = (schema: z.ZodType): unknown =>
  (schema._zod.def as { checks?: unknown[] }).checks?.[0];

// A check's zod kind; an empty or non-string kind is unknown (Astra r8 B30).
export const checkKind = (check: unknown): string => {
  const kind = ownValue(checkDef(check), 'check');
  return typeof kind === 'string' && kind !== '' ? kind : 'unknown';
};

// zod's default `when` of its length and size checks, captured once (addendum 4); any other `when`
// receives the writable parse payload and can change any value it reaches (Astra r8 B28).
const LENGTH_WHEN = ownValue(checkDef(firstCheck(z.array(z.string()).min(1))), 'when');
const SIZE_WHEN = ownValue(checkDef(firstCheck(z.file().min(1))), 'when');
const DEFAULT_WHEN: ReadonlyMap<string, unknown> = new Map([
  ['min_length', LENGTH_WHEN],
  ['max_length', LENGTH_WHEN],
  ['length_equals', LENGTH_WHEN],
  ['min_size', SIZE_WHEN],
  ['max_size', SIZE_WHEN],
  ['size_equals', SIZE_WHEN],
]);
export const hasCustomWhen = (check: unknown): boolean => {
  const when = ownValue(checkDef(check), 'when');
  return when !== undefined && when !== DEFAULT_WHEN.get(checkKind(check));
};

// A check holding a zod schema (`z.property`) parses it, with its checks and `when` callbacks, out of
// the walk's reach: any own definition value carrying `_zod` counts (Astra r9 B28, addendum 8).
const carriesSchema = (value: unknown): boolean =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && '_zod' in value;
export const holdsSchema = (check: unknown): boolean => {
  const def = checkDef(check);
  return def !== null && Reflect.ownKeys(def).some(key => carriesSchema(def[key]));
};

// A container may carry an array's size check (kind and zod class trait); its `when` is judged first.
const ARRAY_SIZE_TRAITS: ReadonlyMap<string, string> = new Map([
  ['min_length', '$ZodCheckMinLength'],
  ['max_length', '$ZodCheckMaxLength'],
  ['length_equals', '$ZodCheckLengthEquals'],
]);
export const isArraySizeCheck = (check: unknown): boolean => {
  const trait = ARRAY_SIZE_TRAITS.get(checkKind(check));
  const traits = ownValue(ownValue(check, '_zod'), 'traits');
  return trait !== undefined && traits instanceof Set && Set.prototype.has.call(traits, trait);
};
