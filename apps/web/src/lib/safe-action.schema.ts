import { z } from 'zod';

import {
  checkDef,
  checkKind,
  hasCustomWhen,
  holdsSchema,
  isArraySizeCheck,
  ownValue,
} from './safe-action.check-def';
import { ownerColumnKeys, TENANT_IDENTITY_KEYS } from './safe-action.owner-keys';

// An action's input schema, walked over its zod 4 definition (design §1.4, addenda 6 to 13): strict
// objects only, no identity key, scalar, wrapper, array, tuple, union and (in a form) file nodes, no
// node that widens, defaults or pipes. The walk's own steps are bounded (no recursion, depth 32, 5000
// units of work) and anything thrown while judging is a refusal; the cost of building or listing a
// developer's schema is not (it runs once at module load). Refused anywhere: a check on a container but
// an array's size or a scalar wrapper's checks; a check with a custom `when`, holding a schema, or
// with an accessor or another prototype (read from descriptors, unread). Scope: schemas built through
// zod's public API. Scalar-rewriting checks and coercions reach the handler until WP-02 part 1b.
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
  onPath: Set<z.ZodType>;
  visits: number;
  // The walk's own refusal, so the catch can tell it apart by identity alone (r15 B42).
  refusal?: ActionDefinitionError;
};

function defOf(schema: z.ZodType): ZodDef {
  return (schema as unknown as { _zod: { def: ZodDef } })._zod.def;
}

// A wrapper around a scalar holds a scalar or null/undefined: its checks are scalar checks (r3 B16).
// It follows the chain no further than the walk's depth bound (r13 B45).
function wrapsScalar(def: ZodDef): boolean {
  let inner = def;
  for (let hop = 0; hop < MAX_DEPTH && WRAPPER_TYPES.has(inner.type) && inner.innerType; hop += 1) {
    inner = defOf(inner.innerType);
  }
  return inner !== def && SCALAR_TYPES.has(inner.type);
}

// The first check a container may not carry (addendum 6): it could replace what it holds and add an
// undeclared key (SEC-02). An array's size is accepted; a scalar wrapper is judged as a scalar.
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
  spend(ctx, path, checks.length);
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

// The walk is bounded in depth and in work: every node visited, catchall inspected and check
// scanned counts against one budget, far beyond any input form (r12 B39-B41, r13 B43-B44).
const MAX_DEPTH = 32;
const MAX_NODES = 5000;
const TOO_LARGE = `a schema deeper than ${MAX_DEPTH} levels or past ${MAX_NODES} units of walk work`;
function spend(ctx: WalkContext, path: string, units: number): void {
  ctx.visits += units;
  if (ctx.visits > MAX_NODES) refuse(ctx, path, TOO_LARGE);
}

function refuse(ctx: WalkContext, path: string, reason: string): never {
  ctx.refusal = new ActionDefinitionError(
    ctx.operation,
    `input schema refused at ${path || '<root>'}: ${reason}`
  );
  throw ctx.refusal;
}

function walkObject(def: ZodDef, path: string, ctx: WalkContext): void {
  // The catchall is charged before its type is read (r14 B44).
  if (def.catchall) spend(ctx, `${path}{catchall}`, 1);
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
  // One field at a time, under the budget: reading a field runs its getter (r13 B42).
  const shape = def.shape ?? {};
  for (const key of Object.keys(shape)) {
    const childPath = path ? `${path}.${key}` : key;
    if (ctx.identityKeys.has(key)) refuse(ctx, childPath, 'identity keys come from server context');
    walk(shape[key], childPath, ctx);
  }
}

// A schema met again on its own path refers to itself (zod's getter form): refused (r11 B38).
function walk(schema: z.ZodType, path: string, ctx: WalkContext): void {
  if (ctx.onPath.has(schema)) refuse(ctx, path, 'a recursive schema (it refers to itself)');
  if (ctx.onPath.size >= MAX_DEPTH) refuse(ctx, path, TOO_LARGE);
  spend(ctx, path, 1);
  ctx.onPath.add(schema);
  walkNode(schema, path, ctx);
  ctx.onPath.delete(schema);
}

function walkNode(schema: z.ZodType, path: string, ctx: WalkContext): void {
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
    onPath: new Set(),
    visits: 0,
  };
  try {
    if (defOf(schema).type !== 'object') refuse(ctx, '', 'the root must be a strict object');
    walk(schema, '', ctx);
    if (options.form) assertFormFields(schema, ctx);
  } catch (error) {
    // Anything else thrown while the schema is judged (a developer getter's error, a stack exhausted
    // in any realm) is a refusal too. The thrown value is only compared by identity, never read: no
    // `instanceof`, so no proxy trap runs (r13 B42, r14 B42, r15 B42).
    if (ctx.refusal !== undefined && error === ctx.refusal) throw ctx.refusal;
    refuse(ctx, '', 'a schema that cannot be judged (reading it threw)');
  }
  const root = defOf(schema);
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
