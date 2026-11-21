import { z } from 'zod';

import { isOwnReadable, isSnapshotRecord, ownKeys } from './safe-action.check-def';
import {
  rebuildCheck,
  type CapturedCheck,
  type CheckDomain,
  type Refuse,
} from './safe-action.checks';

export type Literal = string | number | boolean | bigint | null | undefined;
export type ScalarType = 'string' | 'number' | 'boolean' | 'bigint' | 'date' | 'file';
export type WrapperType = 'optional' | 'nullable' | 'readonly';

type ShapeBody =
  | { type: ScalarType; coerce: boolean }
  | { type: WrapperType; inner: Shape }
  | { type: 'enum'; values: readonly (string | number)[] }
  | { type: 'literal'; values: readonly Literal[] }
  | { type: 'object'; fields: Readonly<Record<string, Shape>> }
  | { type: 'array'; element: Shape }
  | { type: 'tuple'; items: readonly Shape[] }
  | { type: 'union'; branches: readonly Shape[]; discriminator: string | null };

export type Shape = Readonly<ShapeBody & { checks: readonly CapturedCheck[] }>;
export type ShapeNode = ShapeBody;
export type ObjectShape = Extract<Shape, { type: 'object' }>;

export function enumValues(raw: unknown, refuse: Refuse): readonly (string | number)[] {
  if (
    !isOwnReadable(raw) ||
    (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)
  ) {
    return refuse('invalid enum entries');
  }
  const entries: Record<string, string | number> = Object.create(null);
  for (const key of ownKeys(raw)) {
    const entry = Object.getOwnPropertyDescriptor(raw, key);
    const value: unknown =
      entry?.enumerable && Object.hasOwn(entry, 'value') ? entry.value : undefined;
    if (typeof key !== 'string' || (typeof value !== 'string' && typeof value !== 'number')) {
      return refuse('invalid enum entry');
    }
    entries[key] = value;
  }
  return Object.freeze(z.core.util.getEnumValues(entries));
}

export function checkDomain(node: ShapeNode): CheckDomain {
  let nullable = false;
  let optional = false;
  let leaf = node;
  while ('inner' in leaf) {
    nullable ||= leaf.type === 'nullable';
    optional ||= leaf.type === 'optional';
    leaf = leaf.inner;
  }
  if (leaf.type === 'literal' || leaf.type === 'enum') {
    const kinds = valueKinds(leaf.values);
    return {
      type: kinds.length === 1 ? kinds[0] : leaf.type,
      nullable,
      optional,
      builtInOnly: true,
    };
  }
  const type =
    'inner' in node && (leaf.type === 'array' || leaf.type === 'file') ? node.type : leaf.type;
  return { type, nullable, optional };
}

export function unwrap(shape: Shape): Shape {
  let child = shape;
  while ('inner' in child) child = child.inner;
  return child;
}

type Kind = ScalarType | 'array' | 'object';

function valueKinds(values: readonly Literal[]): Kind[] {
  return [
    ...new Set(
      values.flatMap(value =>
        value == null ? [] : [typeof value as 'string' | 'number' | 'boolean' | 'bigint']
      )
    ),
  ];
}

function kinds(node: Shape): Kind[] {
  const shape = unwrap(node);
  if (shape.type === 'union') return [...new Set(shape.branches.flatMap(kinds))];
  if (shape.type === 'tuple') return ['array'];
  if (shape.type === 'literal' || shape.type === 'enum') return valueKinds(shape.values);
  return [shape.type as Kind];
}

function children(shape: Shape): readonly Shape[] {
  if (shape.type === 'object') return Object.values(shape.fields);
  if (shape.type === 'array') return [shape.element];
  if (shape.type === 'tuple') return shape.items;
  if (shape.type === 'union') return shape.branches;
  return 'inner' in shape ? [shape.inner] : [];
}

function anywhere(shape: Shape, predicate: (shape: Shape) => boolean): boolean {
  return predicate(shape) || children(shape).some(child => anywhere(child, predicate));
}

export function hasFile(shape: Shape): boolean {
  return anywhere(shape, child => child.type === 'file');
}

function admitsNullish(shape: Shape, value: null | undefined): boolean {
  switch (shape.type) {
    case 'optional':
      return value === undefined || admitsNullish(shape.inner, value);
    case 'nullable':
      return value === null || admitsNullish(shape.inner, value);
    case 'readonly':
      return admitsNullish(shape.inner, value);
    case 'literal':
      return shape.values.includes(value);
    case 'union':
      return shape.branches.some(branch => admitsNullish(branch, value));
    default:
      return false;
  }
}

function assertDiscriminator(branches: readonly Shape[], key: string, refuse: Refuse): void {
  const tags = new Set<Literal>();
  for (const branch of branches) {
    const field = branch.type === 'object' ? branch.fields[key] : undefined;
    if (!field || (field.type !== 'literal' && field.type !== 'enum') || field.checks.length) {
      return refuse('a discriminator must be a bare literal or enum on each strict object');
    }
    for (const tag of field.values) {
      if (tags.has(tag)) return refuse('a discriminator value names multiple branches');
      tags.add(tag);
    }
  }
}

export function assertUnion(node: Extract<ShapeNode, { type: 'union' }>, refuse: Refuse): void {
  const { branches, discriminator } = node;
  if (branches.some(branch => anywhere(branch, child => 'coerce' in child && child.coerce))) {
    return refuse('coercion inside a union');
  }
  if (discriminator !== null) return assertDiscriminator(branches, discriminator, refuse);
  if (branches.filter(branch => anywhere(branch, child => child.type === 'object')).length > 1) {
    return refuse('a plain union may contain objects in only one branch');
  }
  const seen = new Map<Kind, boolean>();
  let overlapsObject = false;
  for (const branch of branches) {
    const shape = unwrap(branch);
    const branchKinds = kinds(shape);
    overlapsObject ||=
      (branchKinds.includes('object') && (seen.has('date') || seen.has('file'))) ||
      (seen.has('object') && (branchKinds.includes('date') || branchKinds.includes('file')));
    const uncheckedSet =
      (shape.type === 'literal' || shape.type === 'enum') &&
      !anywhere(branch, child => child.checks.length > 0);
    for (const kind of branchKinds) {
      const previous = seen.get(kind);
      if (previous !== undefined && !(previous && uncheckedSet)) {
        return refuse('a plain union must have distinct branch kinds');
      }
      seen.set(kind, uncheckedSet);
    }
  }
  // A synchronous success can leave earlier async checks running. Even a strict object
  // branch can start checking fields on a Date or File before rejecting it.
  if (
    branches.some(branch =>
      anywhere(branch, child => child.checks.some(check => check[0] === 'custom'))
    ) &&
    (overlapsObject ||
      [null, undefined].some(
        value => branches.filter(branch => admitsNullish(branch, value)).length > 1
      ))
  ) {
    return refuse('a plain union with overlapping branches and a refinement');
  }
}

export type FieldKind = 'array' | 'scalar' | 'object';

export function formKind(node: Shape): FieldKind | 'mixed' {
  const shape = unwrap(node);
  if (shape.type === 'array' || shape.type === 'tuple') return 'array';
  if (shape.type === 'object') return 'object';
  if (shape.type !== 'union') return 'scalar';
  const branches = shape.branches.map(formKind);
  if (branches.every(kind => kind === 'array')) return 'array';
  if (branches.some(kind => kind === 'mixed' || kind === 'array')) return 'mixed';
  return branches.every(kind => kind === 'object') ? 'object' : 'scalar';
}

export function assertObjectParts(
  root: ObjectShape,
  parts: readonly string[],
  refuseAt: (path: string) => Refuse
): void {
  for (const key of parts) {
    if (root.fields[key]?.type !== 'object')
      refuseAt(key)('an object part must be a strict object');
  }
  const query = parts.includes('query') ? root.fields.query : undefined;
  if (query?.type !== 'object') return;
  for (const [key, child] of Object.entries(query.fields)) {
    if (formKind(child) === 'mixed') {
      refuseAt(`query.${key}`)('a query field may not mix array and non-array union branches');
    }
  }
}

export function fieldAt(root: Shape, path: readonly string[], strict = false): Shape | undefined {
  let shape: Shape | undefined = root;
  for (const key of path) {
    if (shape === undefined) return undefined;
    const parent: Shape = strict ? shape : unwrap(shape);
    if (parent.type !== 'object') return undefined;
    shape = parent.fields[key];
  }
  return shape;
}

function schemaFor(shape: Shape): z.ZodType {
  switch (shape.type) {
    case 'string':
      return shape.coerce ? z.coerce.string() : z.string();
    case 'number':
      return shape.coerce ? z.coerce.number() : z.number();
    case 'boolean':
      return shape.coerce ? z.coerce.boolean() : z.boolean();
    case 'bigint':
      return shape.coerce ? z.coerce.bigint() : z.bigint();
    case 'date':
      return shape.coerce ? z.coerce.date() : z.date();
    case 'file':
      return z.file();
    case 'literal':
      return z.literal(shape.values);
    case 'enum':
      return z.enum(Object.fromEntries(shape.values.map((value, index) => [`v${index}`, value])));
    case 'optional':
      return rebuildParser(shape.inner).optional();
    case 'nullable':
      return rebuildParser(shape.inner).nullable();
    case 'readonly':
      return rebuildParser(shape.inner).readonly();
    case 'array':
      return z.array(rebuildParser(shape.element));
    case 'tuple': {
      const items = shape.items.map(rebuildParser);
      return items.length ? z.tuple(items as [z.ZodType, ...z.ZodType[]]) : z.tuple([]);
    }
    case 'object': {
      const fields: Record<string, z.ZodType> = Object.create(null);
      for (const [key, field] of Object.entries(shape.fields)) fields[key] = rebuildParser(field);
      return z.strictObject(fields);
    }
    case 'union': {
      const branches = shape.branches.map(rebuildParser) as [z.ZodType, ...z.ZodType[]];
      return shape.discriminator === null
        ? z.union(branches)
        : z.discriminatedUnion(shape.discriminator, branches as [z.ZodObject, ...z.ZodObject[]]);
    }
  }
}

export function rebuildParser(shape: Shape): z.ZodType {
  const base = schemaFor(shape);
  const parser = shape.checks.length
    ? base.check(...shape.checks.map(check => rebuildCheck(check) as z.core.$ZodCheck<unknown>))
    : base;
  Object.defineProperties(parser._zod.def, {
    coerce: { value: 'coerce' in shape && shape.coerce },
    abort: { value: false },
  });
  if (shape.type === 'object' || (shape.type === 'union' && shape.discriminator !== null)) {
    // Plain unions can try an object branch on a Date or File before selecting another branch.
    const run = parser._zod.run;
    parser._zod.run = (payload, context) => {
      if (isSnapshotRecord(payload.value)) return run(payload, context);
      payload.issues.push({
        code: 'invalid_type',
        expected: 'object',
        input: undefined,
        inst: parser,
      });
      return payload;
    };
  }
  return parser;
}
