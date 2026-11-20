import { z } from 'zod';

import { ownerColumnKeys, TENANT_IDENTITY_KEYS } from './safe-action.owner-keys';

// The accepted forms of an action's input schema, walked over the zod 4 definition at definition
// time (design §1.4): a strict object root, strict objects at every depth, no identity key, and only
// scalar, wrapper, array, tuple, union and (in a form) file nodes. A node that can widen, default or
// pipe into another shape is refused. So is any check on an object, wrapper, array, tuple or union,
// except an array's size and the checks of a wrapper around a scalar, and so is any check, anywhere,
// with a `when` callback other than zod's own (SEC-02: nothing may add an undeclared key; addenda 6
// and 7). Checks on scalar and file nodes are otherwise not judged in part 1: a check that rewrites
// a scalar, and a coercion, reach the handler as zod returns them, until the runtime input guard of
// WP-02 part 1b.
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

type CheckInternals = {
  _zod?: { def?: { check?: unknown; when?: unknown }; traits?: { has(name: string): boolean } };
};
const internals = (check: unknown) => (check as CheckInternals | null)?._zod;
const firstCheck = (schema: z.ZodType): unknown =>
  (schema._zod.def as { checks?: unknown[] }).checks?.[0];

// A check's zod kind; an empty or non-string kind is unknown (Astra r8 B30).
const checkKind = (check: unknown): string => {
  const kind = internals(check)?.def?.check;
  return typeof kind === 'string' && kind !== '' ? kind : 'unknown';
};

// zod gives its length and size checks a default `when` (run only on a value that has a length or
// a size), captured once from zod itself as addendum 4 did. Any other `when` is a developer callback
// that receives the writable parse payload and can change any value it reaches (Astra r8 B28).
const LENGTH_WHEN = internals(firstCheck(z.array(z.string()).min(1)))?.def?.when;
const SIZE_WHEN = internals(firstCheck(z.file().min(1)))?.def?.when;
const DEFAULT_WHEN: ReadonlyMap<string, unknown> = new Map([
  ['min_length', LENGTH_WHEN],
  ['max_length', LENGTH_WHEN],
  ['length_equals', LENGTH_WHEN],
  ['min_size', SIZE_WHEN],
  ['max_size', SIZE_WHEN],
  ['size_equals', SIZE_WHEN],
]);
const hasCustomWhen = (check: unknown): boolean => {
  const when = internals(check)?.def?.when;
  return when !== undefined && when !== DEFAULT_WHEN.get(checkKind(check));
};

// The checks a container may carry: an array's size, recognised by its kind and zod's own class
// trait, which cannot change a value (its `when` is judged first, for every check).
const ARRAY_SIZE_TRAITS: ReadonlyMap<string, string> = new Map([
  ['min_length', '$ZodCheckMinLength'],
  ['max_length', '$ZodCheckMaxLength'],
  ['length_equals', '$ZodCheckLengthEquals'],
]);
const isArraySizeCheck = (check: unknown): boolean => {
  const trait = ARRAY_SIZE_TRAITS.get(checkKind(check));
  return trait !== undefined && internals(check)?.traits?.has(trait) === true;
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

// Refuses a check with a custom `when` on this node: its own checks, and the node itself when it is
// also a check (`z.email()` as a field). Called for every node the walk reaches (addendum 7).
function assertDefaultWhen(schema: z.ZodType, def: ZodDef, path: string, ctx: WalkContext): void {
  const checks = def.check === undefined ? (def.checks ?? []) : [schema, ...(def.checks ?? [])];
  if (checks.some(hasCustomWhen)) {
    refuse(
      ctx,
      path,
      `a check with a custom when callback (it receives the writable payload) on a ${def.type}`
    );
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
  if (def.catchall) assertDefaultWhen(def.catchall, defOf(def.catchall), `${path}{catchall}`, ctx);
  for (const [key, child] of Object.entries(def.shape ?? {})) {
    const childPath = path ? `${path}.${key}` : key;
    if (ctx.identityKeys.has(key)) refuse(ctx, childPath, 'identity keys come from server context');
    walk(child, childPath, ctx);
  }
}

function walk(schema: z.ZodType, path: string, ctx: WalkContext): void {
  const def = defOf(schema);
  const { type } = def;
  assertDefaultWhen(schema, def, path, ctx);
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
