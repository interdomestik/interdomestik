import {
  ACCESSOR,
  asyncSchemaReason,
  denseArray,
  hasTrait,
  isOwnReadable,
  ownKeys,
  ownValue,
  rawObjectShape,
  schemaDef,
} from './safe-action.check-def';
import { captureCheck, type CheckDomain, type Refuse } from './safe-action.checks';
import { ownerColumnKeys, TENANT_IDENTITY_KEYS } from './safe-action.owner-keys';
import { STANDARD_OBJECT_KEYS } from './safe-action.recheck';
import {
  assertObjectParts,
  assertUnion,
  checkDomain,
  enumValues,
  fieldAt,
  formKind,
  type Literal,
  type ObjectShape,
  type ScalarType,
  type Shape,
  type ShapeNode,
  type WrapperType,
} from './safe-action.shape';

export class ActionDefinitionError extends Error {
  constructor(operation: string, detail: string) {
    super(`defineAction(${operation}): ${detail}`);
    const name = { __proto__: null, value: 'ActionDefinitionError' };
    Object.defineProperty(this, 'name', name);
  }
}

export type SchemaCheckOptions = {
  operation: string;
  basisKind: 'role' | 'self';
  form: boolean;
  subjectFrom: readonly string[] | null;
  objectParts?: readonly string[];
};

type Walk = {
  options: SchemaCheckOptions;
  reserved: ReadonlySet<PropertyKey>;
  identity: ReadonlySet<string>;
  onPath: Set<unknown>;
  visits: number;
  refusal?: ActionDefinitionError;
};

export const MAX_INPUT_DEPTH = 32;
const MAX_NODES = 5000;
const TOO_LARGE = `a schema deeper than ${MAX_INPUT_DEPTH} levels or past ${MAX_NODES} units of walk work`;
const wrappers: ReadonlySet<unknown> = new Set(['optional', 'nullable', 'readonly']);
const scalars: ReadonlySet<unknown> = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'date',
  'file',
]);
const coercible: ReadonlySet<unknown> = new Set(['string', 'number', 'boolean', 'bigint', 'date']);

function refuseAt(ctx: Walk, path: string): Refuse {
  return detail => {
    ctx.refusal = new ActionDefinitionError(
      ctx.options.operation,
      `input schema refused at ${path || '<root>'}: ${detail}`
    );
    throw ctx.refusal;
  };
}

function spend(ctx: Walk, units: number, refuse: Refuse): void {
  ctx.visits += units;
  if (ctx.visits > MAX_NODES) refuse(TOO_LARGE);
}

function list(value: unknown, refuse: Refuse, max = MAX_NODES): unknown[] {
  if (Array.isArray(value) && (ownValue(value, 'length') as number) > max) return refuse(TOO_LARGE);
  return denseArray(value, max) ?? refuse('a list that is not a dense own-data array');
}

function shapeFields(def: Readonly<Record<PropertyKey, unknown>>, path: string, ctx: Walk) {
  const refuse = refuseAt(ctx, path);
  const refuseCatchall = refuseAt(ctx, `${path}{catchall}`);
  const catchall = ownValue(def, 'catchall');
  if (catchall !== undefined) spend(ctx, 1, refuseCatchall);
  const never = schemaDef(catchall);
  if (!never || ownValue(never, 'type') !== 'never') {
    return refuse('objects must be strict (z.strictObject or .strict())');
  }
  const domain = { type: 'never', nullable: false, optional: false };
  checksFor(catchall, never, domain, 'never', ctx, refuseCatchall);
  if (Object.hasOwn(never, 'checks') || Object.hasOwn(never, 'check')) {
    return refuseCatchall('a never catchall with checks');
  }

  const shape = rawObjectShape(def);
  if (!isOwnReadable(shape)) return refuse('an invalid object shape');
  const fields: Record<string, Shape> = Object.create(null);
  for (const key of ownKeys(shape)) {
    if (typeof key !== 'string') return refuse('a non-string object key');
    const childPath = path ? `${path}.${key}` : key;
    if (ctx.identity.has(key)) refuseAt(ctx, childPath)('identity keys come from server context');
    if (ctx.reserved.has(key)) refuseAt(ctx, childPath)('a reserved Object.prototype key');
    if (ctx.visits >= MAX_NODES) refuseAt(ctx, childPath)(TOO_LARGE);
    const field = Object.getOwnPropertyDescriptor(shape, key);
    if (!field || !Object.hasOwn(field, 'value')) {
      return refuseAt(ctx, childPath)('a shape field that is not own data');
    }
    if (!field.enumerable) return refuseAt(ctx, childPath)('a shape field that is not enumerable');
    fields[key] = walk(field.value, childPath, ctx);
  }
  return Object.freeze(fields);
}

function isLiteral(value: unknown): value is Literal {
  return value == null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value);
}

function unionNode(
  schema: unknown,
  def: Readonly<Record<PropertyKey, unknown>>,
  path: string,
  ctx: Walk
): ShapeNode {
  const refuse = refuseAt(ctx, path);
  const discriminator = ownValue(def, 'discriminator');
  const inclusive = ownValue(def, 'inclusive');
  const discriminated = hasTrait(schema, '$ZodDiscriminatedUnion');
  if (discriminated && Object.hasOwn(def, 'unionFallback')) {
    return refuse('a discriminated union with unionFallback');
  }
  if (
    discriminated
      ? typeof discriminator !== 'string'
      : discriminator !== undefined ||
        !hasTrait(schema, '$ZodUnion') ||
        hasTrait(schema, '$ZodXor') ||
        (inclusive !== undefined && inclusive !== true)
  ) {
    return refuse('a union variant other than inclusive or discriminated');
  }
  const branches = Object.freeze(
    list(ownValue(def, 'options'), refuse).map(option => walk(option, path, ctx))
  );
  if (!branches.length) return refuse('a union without branches');
  const node = {
    type: 'union',
    branches,
    discriminator: discriminated ? (discriminator as string) : null,
  } as const;
  assertUnion(node, refuse);
  return node;
}

function nodeFor(
  schema: unknown,
  def: Readonly<Record<PropertyKey, unknown>>,
  type: string,
  path: string,
  ctx: Walk,
  refuse: Refuse
): ShapeNode {
  if (scalars.has(type)) {
    const coerce = ownValue(def, 'coerce');
    if (type === 'file' && !ctx.options.form)
      return refuse('z.file() is accepted in form actions only');
    if (coerce !== undefined && coerce !== false && !(coerce === true && coercible.has(type))) {
      return refuse('a coercion other than a supported primitive coercion');
    }
    return { type: type as ScalarType, coerce: coerce === true };
  }
  if (wrappers.has(type)) {
    if (type === 'optional' && hasTrait(schema, '$ZodExactOptional')) {
      return refuse('exactOptional is not supported');
    }
    return { type: type as WrapperType, inner: walk(ownValue(def, 'innerType'), path, ctx) };
  }
  switch (type) {
    case 'object':
      return { type, fields: shapeFields(def, path, ctx) };
    case 'array':
      return { type, element: walk(ownValue(def, 'element'), `${path}[]`, ctx) };
    case 'tuple': {
      if (ownValue(def, 'rest') != null) return refuse('tuples may not have a rest element');
      return {
        type,
        items: Object.freeze(
          list(ownValue(def, 'items'), refuse).map((item, index) =>
            walk(item, `${path}[${index}]`, ctx)
          )
        ),
      };
    }
    case 'union':
      return unionNode(schema, def, path, ctx);
    case 'enum':
      return { type, values: enumValues(ownValue(def, 'entries'), refuse) };
    case 'literal': {
      const values = list(ownValue(def, 'values'), refuse);
      if (!values.every(isLiteral)) return refuse('a non-primitive literal');
      return { type, values: Object.freeze(values) };
    }
    default:
      return refuse(`schema type "${type}" is not an accepted form`);
  }
}

function checksFor(
  schema: unknown,
  def: Readonly<Record<PropertyKey, unknown>>,
  domain: CheckDomain,
  type: string,
  ctx: Walk,
  refuse: Refuse
) {
  const raw = ownValue(def, 'checks');
  if (raw !== undefined && !Array.isArray(raw)) {
    return refuse(`a checks list that is an accessor or not an array on a ${type}`);
  }
  const ownCheck = Object.hasOwn(def, 'check');
  const remaining = MAX_NODES - ctx.visits - Number(ownCheck);
  const checks = raw === undefined ? [] : list(raw, refuse, remaining);
  spend(ctx, checks.length + Number(ownCheck), refuse);
  const captured = checks.map(check => captureCheck(check, undefined, domain, type, refuse));
  if (ownCheck) captured.unshift(captureCheck(schema, def, domain, type, refuse));
  return Object.freeze(captured);
}

function walk(schema: unknown, path: string, ctx: Walk): Shape {
  const refuse = refuseAt(ctx, path);
  if (ctx.onPath.has(schema)) return refuse('a recursive schema (it refers to itself)');
  if (ctx.onPath.size >= MAX_INPUT_DEPTH) return refuse(TOO_LARGE);
  spend(ctx, 1, refuse);
  const def = schemaDef(schema);
  const type = ownValue(def, 'type');
  if (!def || type === ACCESSOR || typeof type !== 'string') {
    return refuse('a schema whose definition or type is not own data');
  }
  const asyncReason = asyncSchemaReason(def, type);
  if (asyncReason !== undefined) return refuse(asyncReason);
  if (!path && ctx.onPath.size === 0 && type !== 'object')
    return refuse('the root must be a strict object');
  ctx.onPath.add(schema);
  const node = nodeFor(schema, def, type, path, ctx, refuse);
  const checks = checksFor(schema, def, checkDomain(node), type, ctx, refuse);
  ctx.onPath.delete(schema);
  const captured = Object.freeze({ ...node, checks });
  if (ctx.options.form && node.type === 'union' && formKind(captured) === 'mixed') {
    return refuse('a form field may not mix array and non-array union branches');
  }
  return captured;
}

export function captureSchema(input: unknown, options: SchemaCheckOptions): ObjectShape {
  const ctx: Walk = {
    options,
    reserved: new Set([...STANDARD_OBJECT_KEYS, ...ownKeys(Object.prototype)]),
    identity: options.basisKind === 'self' ? ownerColumnKeys() : TENANT_IDENTITY_KEYS,
    onPath: new Set(),
    visits: 0,
  };
  try {
    const root = walk(input, '', ctx);
    if (root.type !== 'object') return refuseAt(ctx, '')('the root must be a strict object');
    assertObjectParts(root, options.objectParts ?? [], path => refuseAt(ctx, path));
    if (
      options.subjectFrom !== null &&
      (!options.subjectFrom.length || fieldAt(root, options.subjectFrom, true) === undefined)
    ) {
      return refuseAt(
        ctx,
        ''
      )(`subject.from "${options.subjectFrom.join('.')}" is not a declared input path`);
    }
    return root;
  } catch (error) {
    if (error === ctx.refusal && ctx.refusal !== undefined) throw ctx.refusal;
    return refuseAt(ctx, '')('a schema that cannot be judged (reading it threw)');
  }
}
