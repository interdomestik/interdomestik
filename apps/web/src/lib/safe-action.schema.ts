import { z } from 'zod';

import { ownerColumnKeys, TENANT_IDENTITY_KEYS } from './safe-action.owner-keys';

// The accepted forms of an action's input schema, walked over the zod 4 definition at definition
// time (design §1.4): a strict object root, strict objects at every depth, no identity key, and only
// scalar, wrapper, array, tuple, union and (in a form) file nodes. A node that can widen, default or
// pipe into another shape is refused. So is any check on an object, wrapper, array, tuple or union,
// except an array's size and the checks of a wrapper around a scalar, and so is any check, anywhere,
// with a `when` callback other than zod's own or whose definition holds a schema (SEC-02: nothing may
// add an undeclared key; addenda 6 to 9). A check's definition is read from its descriptors: one with
// an accessor or another prototype is refused unread. The walk judges schemas built through zod's
// public API; other internals of a hand-built schema or check object are not judged. Checks on scalar
// and file nodes are otherwise not judged in part 1: a check that rewrites a scalar, and a coercion,
// reach the handler as zod returns them, until the runtime input guard of WP-02 part 1b.
type ZodDef = {
  type: string;
  check?: unknown;
  shape?: Record<string, z.ZodType>;
  catchall?: z.ZodType;
  checks?: unknown[];
  innerType?: z.ZodType;
  element?: z.ZodType;
  items?: z.ZodType[];
  rest?: z.ZodType | null;
  options?: z.ZodType[];
};

const SCALAR_TYPES = new Set(['string', 'number', 'boolean', 'bigint', 'date', 'enum', 'literal']);
const WRAPPER_TYPES = new Set(['optional', 'nullable', 'readonly']);
const CONTAINER_TYPES = new Set([...WRAPPER_TYPES, 'array', 'tuple', 'union']);

// An own property, read from its descriptor: an accessor (no `value`, even with get and set both
// undefined) is never called and reads as ACCESSOR (Astra r10 B28, addendum 9).
const ACCESSOR = Symbol('accessor');
function ownValue(holder: unknown, key: PropertyKey): unknown {
  if ((typeof holder !== 'object' && typeof holder !== 'function') || holder === null) {
    return undefined;
  }
  const own = Reflect.getOwnPropertyDescriptor(holder, key);
  if (own === undefined) return undefined;
  return 'value' in own ? own.value : ACCESSOR;
}

// `check._zod.def` through own data properties, or null when a step or any own key is an accessor or
// its prototype is not Object.prototype (zod would read an inherited `when`); nothing is called.
function checkDef(check: unknown): Readonly<Record<PropertyKey, unknown>> | null {
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
const checkKind = (check: unknown): string => {
  const kind = ownValue(checkDef(check), 'check');
  return typeof kind === 'string' && kind !== '' ? kind : 'unknown';
};

// zod gives its length and size checks a default `when` (run only on a value that has a length or
// a size), captured once from zod itself as addendum 4 did. Any other `when` is a developer callback
// that receives the writable parse payload and can change any value it reaches (Astra r8 B28).
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
const hasCustomWhen = (check: unknown): boolean => {
  const when = ownValue(checkDef(check), 'when');
  return when !== undefined && when !== DEFAULT_WHEN.get(checkKind(check));
};

// A check holding a zod schema (`z.property`) parses it, with its checks and `when` callbacks, out of
// the walk's reach: any own definition value carrying `_zod` counts (Astra r9 B28, addendum 8).
const carriesSchema = (value: unknown): boolean =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && '_zod' in value;
const holdsSchema = (check: unknown): boolean => {
  const def = checkDef(check);
  return def !== null && Reflect.ownKeys(def).some(key => carriesSchema(def[key]));
};

// A container may carry an array's size check (kind and zod class trait); its `when` is judged first.
const ARRAY_SIZE_TRAITS: ReadonlyMap<string, string> = new Map([
  ['min_length', '$ZodCheckMinLength'],
  ['max_length', '$ZodCheckMaxLength'],
  ['length_equals', '$ZodCheckLengthEquals'],
]);
const isArraySizeCheck = (check: unknown): boolean => {
  const trait = ARRAY_SIZE_TRAITS.get(checkKind(check));
  const traits = ownValue(ownValue(check, '_zod'), 'traits');
  return trait !== undefined && traits instanceof Set && Set.prototype.has.call(traits, trait);
};

export class ActionDefinitionError extends Error {
  constructor(operation: string, detail: string) {
    super(`defineAction(${operation}): ${detail}`);
    this.name = 'ActionDefinitionError';
  }
}

type WalkContext = {
  operation: string;
  form: boolean;
  identityKeys: ReadonlySet<string>;
};

function defOf(schema: z.ZodType): ZodDef {
  return (schema as unknown as { _zod: { def: ZodDef } })._zod.def;
}

// A wrapper around a scalar holds a scalar or null/undefined: its checks are scalar checks (r3 B16).
function wrapsScalar(def: ZodDef): boolean {
  let inner = def;
  while (WRAPPER_TYPES.has(inner.type) && inner.innerType) inner = defOf(inner.innerType);
  return inner !== def && SCALAR_TYPES.has(inner.type);
}

// The first check a container node may not carry (r1, kept in part 1 by the lead, addendum 6): any
// check on a wrapper, array, tuple or union can replace what it holds, an object included, and so
// add a key the strict object did not declare, an identity key included (SEC-02). Only an array's
// size is accepted; a wrapper around a scalar is judged as a scalar.
function containerCheck(def: ZodDef): string | undefined {
  if (wrapsScalar(def)) return undefined;
  const accepted = (check: unknown) => def.type === 'array' && isArraySizeCheck(check);
  const refused = (def.checks ?? []).find(check => !accepted(check));
  return refused === undefined ? undefined : checkKind(refused);
}

// Refuses a check with an accessor or another prototype, a custom `when` or a schema, among the node's
// checks and the node itself when its own `check` key is set (`z.email()`); addenda 7 to 9.
function assertNodeChecks(schema: z.ZodType, def: ZodDef, path: string, ctx: WalkContext): void {
  const listed = ownValue(def, 'checks');
  if (listed !== undefined && !Array.isArray(listed)) {
    refuse(ctx, path, `a checks list that is an accessor or not an array on a ${def.type}`);
  }
  const own: unknown[] = listed ?? [];
  const checks = ownValue(def, 'check') === undefined ? own : [schema, ...own];
  if (checks.some(check => checkDef(check) === null)) {
    refuse(
      ctx,
      path,
      `a check whose definition has an accessor or a prototype other than Object (not read) on a ${def.type}`
    );
  }
  if (checks.some(hasCustomWhen)) {
    refuse(
      ctx,
      path,
      `a check with a custom when callback (it receives the writable payload) on a ${def.type}`
    );
  }
  const holding = checks.find(holdsSchema);
  if (holding !== undefined) {
    refuse(ctx, path, `a ${checkKind(holding)} check that holds a schema on a ${def.type}`);
  }
}

function refuse(ctx: WalkContext, path: string, reason: string): never {
  throw new ActionDefinitionError(
    ctx.operation,
    `input schema refused at ${path || '<root>'}: ${reason}`
  );
}

function walkObject(def: ZodDef, path: string, ctx: WalkContext): void {
  if (!def.catchall || defOf(def.catchall).type !== 'never') {
    refuse(ctx, path, 'objects must be strict (z.strictObject or .strict())');
  }
  if (def.checks && def.checks.length > 0) {
    refuse(
      ctx,
      path,
      'object-level refine/check/superRefine/overwrite belongs in the owning command'
    );
  }
  if (def.catchall) assertNodeChecks(def.catchall, defOf(def.catchall), `${path}{catchall}`, ctx);
  for (const [key, child] of Object.entries(def.shape ?? {})) {
    const childPath = path ? `${path}.${key}` : key;
    if (ctx.identityKeys.has(key)) refuse(ctx, childPath, 'identity keys come from server context');
    walk(child, childPath, ctx);
  }
}

function walk(schema: z.ZodType, path: string, ctx: WalkContext): void {
  const def = defOf(schema);
  const { type } = def;
  assertNodeChecks(schema, def, path, ctx);
  if (type === 'object') return walkObject(def, path, ctx);
  if (SCALAR_TYPES.has(type)) return;
  if (type === 'file') {
    if (!ctx.form) refuse(ctx, path, 'z.file() is accepted in form actions only');
    return;
  }
  const check = CONTAINER_TYPES.has(type) ? containerCheck(def) : undefined;
  if (check !== undefined) {
    refuse(ctx, path, `a ${check} check on a ${type} belongs in the owning command`);
  }
  walkContainer(def, path, ctx);
}

// Wrappers, arrays, tuples and unions: walked into; any other type is refused.
function walkContainer(def: ZodDef, path: string, ctx: WalkContext): void {
  const { type } = def;
  if (WRAPPER_TYPES.has(type) && def.innerType) return walk(def.innerType, path, ctx);
  if (type === 'array' && def.element) return walk(def.element, `${path}[]`, ctx);
  if (type === 'tuple') {
    if (def.rest) refuse(ctx, path, 'tuples may not have a rest element');
    (def.items ?? []).forEach((item, index) => walk(item, `${path}[${index}]`, ctx));
    return;
  }
  if (type === 'union') {
    (def.options ?? []).forEach(option => walk(option, path, ctx));
    return;
  }
  refuse(ctx, path, `schema type "${type}" is not an accepted form`);
}

export type SchemaCheckOptions = {
  operation: string;
  basisKind: 'role' | 'self' | 'public';
  form: boolean;
  subjectFrom: string | null;
};

/** Throws ActionDefinitionError unless the schema is an accepted form for this definition. */
export function assertAcceptedSchema(schema: z.ZodType, options: SchemaCheckOptions): void {
  const ctx: WalkContext = {
    operation: options.operation,
    form: options.form,
    identityKeys: options.basisKind === 'self' ? ownerColumnKeys() : TENANT_IDENTITY_KEYS,
  };
  const root = defOf(schema);
  if (root.type !== 'object') refuse(ctx, '', 'the root must be a strict object');
  walk(schema, '', ctx);
  if (options.form) assertFormFields(schema, ctx);
  if (options.subjectFrom !== null && !Object.hasOwn(root.shape ?? {}, options.subjectFrom)) {
    throw new ActionDefinitionError(
      options.operation,
      `subject.from "${options.subjectFrom}" is not a declared top-level input key`
    );
  }
}

// Whether a form field holds an array, something else, or a union of both (r6 B25). Wrappers and
// unions are unwrapped; a union is an array field only when every branch is one.
type FieldKind = 'array' | 'other' | 'mixed';
function fieldKind(schema: z.ZodType): FieldKind {
  let def = defOf(schema);
  while (WRAPPER_TYPES.has(def.type) && def.innerType) def = defOf(def.innerType);
  if (def.type === 'array') return 'array';
  if (def.type !== 'union') return 'other';
  const kinds = new Set((def.options ?? []).map(fieldKind));
  return kinds.size === 1 ? ([...kinds][0] ?? 'other') : 'mixed';
}

// A form collects every value of an array field and refuses a repeated other field, so a field
// whose union mixes array and non-array branches has no single reading (r6 B25).
function assertFormFields(schema: z.ZodType, ctx: WalkContext): void {
  for (const [key, child] of Object.entries(defOf(schema).shape ?? {}))
    if (fieldKind(child) === 'mixed')
      refuse(ctx, key, 'a form field may not mix array and non-array union branches');
}

/** Top-level keys whose schema is an array, or a union of arrays: a form collects every value. */
export function arrayFieldKeys(schema: z.ZodType): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const [key, child] of Object.entries(defOf(schema).shape ?? {}))
    if (fieldKind(child) === 'array') keys.add(key);
  return keys;
}

/** `{ "a.b": "too_small" }`: the path and zod issue code, never the input value. */
export function issuesOf(error: z.ZodError): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_root';
    // Own keys only: a field named like an Object.prototype member is still recorded (r2 B13).
    if (!Object.hasOwn(issues, key)) {
      Object.defineProperty(issues, key, {
        value: issue.code,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return issues;
}
