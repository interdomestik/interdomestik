import { ZodCustom, type z } from 'zod';

import { isActionNormalizer } from './safe-action.normalizers';
import { ownerColumnKeys, TENANT_IDENTITY_KEYS } from './safe-action.owner-keys';

// The accepted forms of an action's input schema, walked over the zod 4 definition at definition
// time (design §1.4). Anything that can widen, default, coerce into another shape or run custom code
// on an object is refused, so the handler receives exactly the declared keys.
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
// Checks that run caller code on the value (refine, superRefine, check) or replace it (overwrite).
// Size checks (min/max/length) on arrays stay accepted.
const CODE_CHECKS = new Set(['custom', 'overwrite']);

const kindOf = (check: unknown): string =>
  (check as { _zod?: { def?: { check?: string } } })._zod?.def?.check ?? 'unknown';
const checkKinds = (def: ZodDef): string[] => (def.checks ?? []).map(kindOf);

// Why a check may not sit on a scalar (or on a wrapper around one), or null (design addendum 3).
// zod's validating checks and `refine` (a ZodCustom that receives the value only) never write the
// value; an `overwrite` does, and so can a superRefine or check callback through its payload. The
// wrapper's named normalisers are the only value-changing checks accepted.
function scalarCheckProblem(check: unknown): string | null {
  if (isActionNormalizer(check)) return null;
  const kind = kindOf(check);
  if (kind === 'overwrite') return 'an overwrite (only actionNormalizers may change a scalar)';
  if (kind === 'custom' && !(check instanceof ZodCustom))
    return 'a superRefine or check callback (it can rewrite the value; use refine)';
  return kind === 'unknown' ? 'a check of unreadable kind' : null;
}

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

function wrapsScalar(def: ZodDef): boolean {
  let inner = def;
  while (WRAPPER_TYPES.has(inner.type) && inner.innerType) inner = defOf(inner.innerType);
  return inner !== def && SCALAR_TYPES.has(inner.type);
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

// Judges the checks on a scalar or on a wrapper around one (design addendum 3).
function judgeScalarChecks(def: ZodDef, path: string, ctx: WalkContext): void {
  for (const check of def.checks ?? []) {
    const problem = scalarCheckProblem(check);
    if (problem) refuse(ctx, path, `${problem} on a ${def.type}`);
  }
}

function walk(schema: z.ZodType, path: string, ctx: WalkContext): void {
  const def = defOf(schema);
  const { type } = def;
  if (type === 'object') return walkObject(def, path, ctx);
  if (SCALAR_TYPES.has(type)) return judgeScalarChecks(def, path, ctx);
  if (wrapsScalar(def)) judgeScalarChecks(def, path, ctx);
  if (type === 'file') {
    if (!ctx.form) refuse(ctx, path, 'z.file() is accepted in form actions only');
    return;
  }
  // A wrapper around a scalar holds a scalar or null/undefined: its checks were judged above as
  // scalar checks (r3 B16).
  const codeCheck = wrapsScalar(def)
    ? undefined
    : checkKinds(def).find(kind => CODE_CHECKS.has(kind) || kind === 'unknown');
  if (codeCheck)
    refuse(ctx, path, `a ${codeCheck} check on a ${type} belongs in the owning command`);
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
  if (options.subjectFrom !== null && !Object.hasOwn(root.shape ?? {}, options.subjectFrom)) {
    throw new ActionDefinitionError(
      options.operation,
      `subject.from "${options.subjectFrom}" is not a declared top-level input key`
    );
  }
}

/** Top-level keys whose schema is an array: a form collects every value of such a key. */
export function arrayFieldKeys(schema: z.ZodType): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const [key, child] of Object.entries(defOf(schema).shape ?? {})) {
    let def = defOf(child);
    while (WRAPPER_TYPES.has(def.type) && def.innerType) def = defOf(def.innerType);
    if (def.type === 'array') keys.add(key);
  }
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
