// CHK-05 schema side (design §6.3, r3 B4, r4 B4, r5): a parse gives provenance only when its schema
// resolves to a strict Zod object and the schema along the spread path has no unconstrained or
// loose member and no shape-changing object-level API.
import ts from 'typescript';

import { importsOf, resolveModule, unwrap } from './ast.mjs';

const OPEN_FACTORIES = new Set([
  'unknown',
  'any',
  'record',
  'looseObject',
  'map',
  'set',
  'custom',
  'instanceof',
  'lazy',
  'promise',
  'function',
  'intersection',
]);
const LOOSE_METHODS = new Set(['passthrough', 'loose', 'catchall', 'nonstrict']);
const ROOT_METHODS = new Set(['strict', 'describe', 'meta', 'readonly']);
const OBJECT_FACTORIES = new Set(['object', 'strictObject']);
const SCHEMA_ARG_FACTORIES = new Set([
  'array',
  'union',
  'discriminatedUnion',
  'tuple',
  'optional',
  'nullable',
  'nullish',
  'readonly',
]);
const WRAPPERS = new Set(['optional', 'nullable', 'nullish', 'readonly', 'describe', 'meta']);
// The only methods an object on a spread path may carry: none of them adds, replaces or drops a
// member or runs caller code. Anything else (extend, merge, pick, partial, refine...) is open.
const OBJECT_METHODS = new Set([...ROOT_METHODS, ...WRAPPERS]);
const openMethod = chain => chain.methods.find(m => !OBJECT_METHODS.has(m.name));

// Method chain of a Zod expression, from the root factory call outwards.
export function chainOf(expression) {
  const methods = [];
  let node = unwrap(expression);
  while (node && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const receiver = unwrap(node.expression.expression);
    if (ts.isIdentifier(receiver) && receiver.text === 'z')
      return {
        factory: node.expression.name.text,
        args: node.arguments,
        methods: methods.toReversed(),
      };
    // Namespaced factories: z.iso.datetime(), z.coerce.number().
    if (
      ts.isPropertyAccessExpression(receiver) &&
      ts.isIdentifier(receiver.expression) &&
      receiver.expression.text === 'z'
    )
      return {
        factory: `${receiver.name.text}.${node.expression.name.text}`,
        args: node.arguments,
        methods: methods.toReversed(),
      };
    methods.push({ name: node.expression.name.text, args: node.arguments });
    node = receiver;
  }
  return { factory: null, reference: node, methods: methods.toReversed() };
}

const isStrictObjectChain = chain =>
  (chain.factory === 'strictObject' ||
    (chain.factory === 'object' && chain.methods.some(m => m.name === 'strict'))) &&
  !chain.methods.some(m => LOOSE_METHODS.has(m.name));

function localConst(identifier) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    const statements = ts.isBlock(scope) || ts.isSourceFile(scope) ? scope.statements : [];
    for (const statement of statements) {
      const isConst =
        ts.isVariableStatement(statement) &&
        Boolean(statement.declarationList.flags & ts.NodeFlags.Const);
      const decl =
        isConst &&
        statement.declarationList.declarations.find(
          d => ts.isIdentifier(d.name) && d.name.text === identifier.text
        );
      if (decl) return decl;
    }
  }
  return null;
}

// Resolves a schema identifier to its `const` initializer (same file or a repository import).
export function createSchemaResolver(root, parse, exportResolver) {
  return function resolveSchema(identifier, file) {
    const local = localConst(identifier);
    if (local) return { file, init: local.initializer };
    const imported = importsOf(identifier.getSourceFile()).get(identifier.text);
    const target = imported && resolveModule(root, file, imported.specifier);
    const hit = target && exportResolver.resolve(target, imported.imported);
    const decl = hit?.decl;
    if (!decl || !ts.isVariableDeclaration(decl) || !(decl.parent.flags & ts.NodeFlags.Const))
      return null;
    return { file: hit.file, init: decl.initializer };
  };
}

function resolvedReasons(identifier, file, resolveSchema, depth) {
  const hit = resolveSchema(identifier, file);
  return hit
    ? openReasons(hit.init, hit.file, resolveSchema, depth + 1)
    : [`unresolved schema ${identifier.text}`];
}

// A reference may only be wrapped; any other method could extend or reshape what it names.
function referenceReasons(chain, file, resolveSchema, depth) {
  const wrappedReference =
    chain.reference &&
    ts.isIdentifier(chain.reference) &&
    chain.methods.every(m => WRAPPERS.has(m.name));
  return wrappedReference
    ? resolvedReasons(chain.reference, file, resolveSchema, depth)
    : ['schema is not a Zod chain'];
}

function objectReasons(chain, file, resolveSchema, depth) {
  if (!isStrictObjectChain(chain)) return ['non-strict object'];
  const changing = openMethod(chain);
  if (changing) return [`object-level ${changing.name}`];
  const shape = unwrap(chain.args[0]);
  if (!shape || !ts.isObjectLiteralExpression(shape)) return ['object shape is not a literal'];
  return shape.properties.flatMap(p =>
    ts.isPropertyAssignment(p)
      ? openReasons(p.initializer, file, resolveSchema, depth + 1)
      : ['shape member is not a plain property']
  );
}

// Every reason the schema subtree is not closed; empty when it is.
export function openReasons(expression, file, resolveSchema, depth = 0) {
  if (depth > 12) return ['schema too deep to resolve'];
  const value = unwrap(expression);
  if (value && ts.isIdentifier(value)) return resolvedReasons(value, file, resolveSchema, depth);
  const chain = chainOf(value);
  if (!chain.factory) return referenceReasons(chain, file, resolveSchema, depth);
  if (OPEN_FACTORIES.has(chain.factory)) return [`z.${chain.factory}`];
  if (chain.methods.some(m => LOOSE_METHODS.has(m.name))) return ['loose object'];
  if (OBJECT_FACTORIES.has(chain.factory)) return objectReasons(chain, file, resolveSchema, depth);
  if (chain.methods.some(m => m.name === 'pipe' || m.name === 'transform'))
    return [`scalar ${chain.factory} changes shape`];
  if (!SCHEMA_ARG_FACTORIES.has(chain.factory)) return [];
  return chain.args
    .flatMap(schemaArgs)
    .flatMap(arg => openReasons(arg, file, resolveSchema, depth + 1));
}

// Schema-valued factory arguments: z.array(x), z.union([a, b]), z.tuple([a]); literals are skipped.
function schemaArgs(arg) {
  const value = unwrap(arg);
  if (!value) return [];
  if (ts.isArrayLiteralExpression(value)) return value.elements.flatMap(schemaArgs);
  return ts.isCallExpression(value) || ts.isIdentifier(value) ? [value] : [];
}

// A parse root: the schema must be a strict object chain whose root methods change nothing.
export function rootProblem(expression, file, resolveSchema) {
  let value = unwrap(expression);
  let at = file;
  for (let hops = 0; value && ts.isIdentifier(value) && hops < 6; hops += 1) {
    const hit = resolveSchema(value, at);
    if (!hit) return `unresolved schema ${value.text}`;
    value = unwrap(hit.init);
    at = hit.file;
  }
  const chain = chainOf(value);
  if (!isStrictObjectChain(chain)) return 'parse schema is not a strict object';
  const extra = chain.methods.find(m => !ROOT_METHODS.has(m.name));
  return extra ? `parse schema adds ${extra.name}` : null;
}

// Why an intermediate object on a spread path is not closed, or null (§6.3, Astra r2 B12).
function intermediateProblem(chain, where) {
  if (!isStrictObjectChain(chain)) return `non-strict object at ${where}`;
  const changing = openMethod(chain);
  return changing ? `object-level ${changing.name} at ${where}` : null;
}

// Schema expression of a member path inside a strict object schema, `{ problem }` when an object
// between the root and the member is not closed, or null when the path cannot be resolved. The root
// itself is judged by rootProblem.
export function memberSchema(expression, file, path, resolveSchema) {
  let value = unwrap(expression);
  let at = file;
  for (const [index, key] of path.entries()) {
    for (let hops = 0; value && ts.isIdentifier(value) && hops < 6; hops += 1) {
      const hit = resolveSchema(value, at);
      if (!hit) return null;
      value = unwrap(hit.init);
      at = hit.file;
    }
    const chain = chainOf(value);
    if (!OBJECT_FACTORIES.has(chain.factory)) return null;
    const problem = index > 0 && intermediateProblem(chain, path.slice(0, index).join('.'));
    if (problem) return { problem };
    const shape = unwrap(chain.args[0]);
    const member =
      shape &&
      ts.isObjectLiteralExpression(shape) &&
      shape.properties.find(p => p.name?.getText() === key);
    if (!member || !ts.isPropertyAssignment(member)) return null;
    value = unwrap(member.initializer);
  }
  return { expression: value, file: at };
}
