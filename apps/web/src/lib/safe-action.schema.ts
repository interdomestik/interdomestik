import type { z } from 'zod';

import { ownerColumnKeys, TENANT_IDENTITY_KEYS } from './safe-action.owner-keys';

// The accepted forms of an action's input schema, walked over the zod 4 definition at definition
// time (design §1.4): a strict object root, strict objects at every depth, no identity key, and only
// scalar, wrapper, array, tuple, union and (in a form) file nodes. A node that can widen, default or
// pipe into another shape is refused, and so is a check on an object. Checks on other nodes are not
// judged in part 1: a check that rewrites a value, and a coercion, reach the handler as zod returns
// them (design addendum 6; the runtime input guard is WP-02 part 1b).
type ZodDef = {
  type: string;
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
  for (const [key, child] of Object.entries(def.shape ?? {})) {
    const childPath = path ? `${path}.${key}` : key;
    if (ctx.identityKeys.has(key)) refuse(ctx, childPath, 'identity keys come from server context');
    walk(child, childPath, ctx);
  }
}

function walk(schema: z.ZodType, path: string, ctx: WalkContext): void {
  const def = defOf(schema);
  const { type } = def;
  if (type === 'object') return walkObject(def, path, ctx);
  if (SCALAR_TYPES.has(type)) return;
  if (type === 'file') {
    if (!ctx.form) refuse(ctx, path, 'z.file() is accepted in form actions only');
    return;
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
