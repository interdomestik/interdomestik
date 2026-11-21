import ts from 'typescript';
import {
  ABSENT, CLIENT, DATA, ENTRY, ITEM, MAX_PROVENANCE_DEPTH, bindingPath, calledAt, clientOrigin,
  createQueryOrigins, directArgument, memberKey, outerValue, parameterOf, plainName, returnsOf,
} from './schema-query-origins.mjs';
import { contextualQueryType, declaredQueryType, mergeOrigins } from './schema-query-types.mjs';
import { isFunctionLike } from './syntax.mjs';

const MAP_VALUE = Symbol('map value');
const PG = new Set(['pg#Client', 'pg#Pool']);
const FALLBACKS = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken]);
const AMBIGUOUS_CLIENT = Symbol('ambiguous client origin');

export function queryReceiverOrigins(tree) {
  const env = createQueryOrigins(tree);
  const sites = new Map();
  env.functionUsesCached = fn => {
    if (!sites.has(fn)) sites.set(fn, env.functionUses(fn));
    return sites.get(fn);
  };
  const stack = new Set();
  env.read = (node, path, inputs = new Map()) => {
    if (!node) return null;
    const value = ts.skipOuterExpressions(node);
    if (stack.has(value) || stack.size >= MAX_PROVENANCE_DEPTH) return null;
    stack.add(value);
    try {
      return readValue(env, value, path, inputs);
    } finally {
      stack.delete(value);
    }
  };
  return node => {
    const origin = env.read(node, []);
    if (origin === CLIENT) return CLIENT;
    if (origin === AMBIGUOUS_CLIENT) return null;
    const query = env.read(node, ['query']);
    return query === DATA || query === ABSENT ? DATA : null;
  };
}

function readValue(env, node, path, inputs) {
  const read = (value, keys = path) => env.read(value, keys, inputs);
  if (ts.isIdentifier(node)) return readIdentifier(env, node, path, inputs);
  if (ts.isAwaitExpression(node)) return read(node.expression);
  if (ts.isCallExpression(node)) return readCall(env, node, path, inputs);
  if (ts.isNewExpression(node)) return readNew(env, node, path, inputs);
  if (ts.isObjectLiteralExpression(node)) return readObject(node, path, read);
  if (ts.isArrayLiteralExpression(node)) return readArray(node, path, read);
  return readExpression(node, path, read);
}

function readExpression(node, path, read) {
  if (ts.isConditionalExpression(node)) return mergeOrigins([read(node.whenTrue), read(node.whenFalse)]);
  if (ts.isBinaryExpression(node)) return readBinary(node, path, read);
  if (ts.isTaggedTemplateExpression(node))
    return !path.length && read(node.tag, []) === 'drizzle-orm#sql' ? DATA : null;
  if (node.kind === ts.SyntaxKind.NullKeyword) return ABSENT;
  if (!path.length && (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ||
    ts.isTemplateExpression(node) || node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword)) return DATA;
  if (isFunctionLike(node)) return path.length ? null : node;
  const key = memberKey(node);
  return key === null ? null : read(node.expression, [key, ...path]);
}

function readBinary(node, path, read) {
  const operator = node.operatorToken.kind;
  if (FALLBACKS.has(operator)) return mergeOrigins([read(node.left), read(node.right)]);
  return !path.length && operator === ts.SyntaxKind.PlusToken ? DATA : null;
}

function readObject(node, [key, ...rest], read) {
  if (key === undefined) return DATA;
  if (typeof key !== 'string') return null;
  for (const property of [...node.properties].reverse()) {
    if (ts.isSpreadAssignment(property)) {
      const value = read(property.expression, [key, ...rest]);
      if (value !== ABSENT) return value;
      continue;
    }
    if (ts.isComputedPropertyName(property.name)) return null;
    if (plainName(property.name) === key) return readProperty(property, rest, read);
  }
  return ABSENT;
}

function readProperty(property, path, read) {
  if (ts.isShorthandPropertyAssignment(property)) return read(property.name, path);
  return ts.isPropertyAssignment(property) ? read(property.initializer, path) : null;
}

function readArray(node, [key, ...rest], read) {
  if (key === undefined) return DATA;
  if (key === ITEM) {
    const values = node.elements.map(element =>
      ts.isSpreadElement(element) ? read(element.expression, [ITEM, ...rest]) : read(element, rest)
    );
    return values.length ? mergeOrigins(values) : ABSENT;
  }
  return read(node.elements[key], rest);
}

function readIdentifier(env, node, path, inputs) {
  const binding = env.lookup(node);
  if (!binding) return node.text === 'undefined' ? ABSENT : null;
  return readBinding(env, binding, path, inputs);
}

function readBinding(env, binding, path, inputs) {
  const pinned = clientOrigin({ file: binding.id.getSourceFile().fileName, name: binding.name });
  if (pinned && ts.isSourceFile(binding.scope)) return path.length ? null : pinned;
  if (binding.kind === 'import') return readImport(env, binding, path, inputs);
  if (binding.kind === 'function')
    return path.length || env.uses(binding).some(ts.isWriteAccess) ? null : binding.decl;
  const prefix = bindingPath(binding.id);
  if (!prefix) return null;
  const keys = [...prefix, ...path];
  if (binding.kind === 'param') return readParameter(env, binding, keys, inputs);
  return binding.kind === 'var' ? readVariable(env, binding, keys, inputs) : null;
}

function readImport(env, binding, path, inputs) {
  if (!binding.specifier) return null;
  const [member, ...rest] = path;
  if (binding.imported === '*' && member !== undefined && typeof member !== 'string') return null;
  const origins = env.imports(binding.id.getSourceFile(), binding, member);
  const keys = binding.imported === '*' ? rest : path;
  return mergeOrigins(origins.map(origin => readOrigin(env, origin, keys, inputs)));
}

function readOrigin(env, origin, path, inputs) {
  const pinned = clientOrigin(origin);
  if (pinned) return path.length ? null : pinned;
  if (origin.external) return path.length ? null : `${origin.external}#${origin.name}`;
  if (origin.namespace && path.length) {
    const [key, ...rest] = path;
    if (typeof key !== 'string') return null;
    return mergeOrigins(origin.namespace.flatMap(file => env.graph.resolveExport(file, key))
      .map(value => readOrigin(env, value, rest, inputs)));
  }
  const binding = origin.file && env.local(origin.file, origin.name);
  return binding ? env.read(binding.id, path, inputs) : null;
}

function readVariable(env, binding, path, inputs) {
  const { decl, id } = binding;
  const loop = decl.parent.parent;
  const values = assignmentValues(env.uses(binding), path);
  if (ts.isForOfStatement(loop) && loop.initializer === decl.parent)
    values.push({ expression: loop.expression, path: [ITEM, ...path] });
  if (decl.initializer) values.push(env.read(decl.initializer, path, inputs));
  const resolved = values.map(value => {
    if (value?.expression) return env.read(value.expression, value.path, inputs);
    return value;
  });
  if (resolved.length) return mergeOrigins(resolved);
  return declaredQueryType(env, id.parent === decl ? decl.type : null, path);
}

function assignmentValues(references, path) {
  return references.flatMap(reference => assignedValues(outerValue(reference), path));
}

function assignedValues(node, path) {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent) && parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
    return [{ expression: parent.right, path }];
  if (ts.isWriteAccess(node)) return [null];
  if (!(ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) ||
    parent.expression !== node) return [];
  if (ts.isWriteAccess(parent) || ts.isDeleteExpression(parent.parent)) return [null];
  if (!isPush(parent, path)) return [];
  return parent.parent.arguments.map(expression => ({ expression, path: path.slice(1) }));
}

function isPush(member, path) {
  const parent = member.parent;
  return path[0] === ITEM && memberKey(member) === 'push' &&
    ts.isCallExpression(parent) && parent.expression === member;
}

function readParameter(env, binding, path, inputs) {
  const param = parameterOf(binding);
  if (!param || assignmentValues(env.uses(binding), path).length) return null;
  const fn = binding.decl;
  const index = fn.parameters.indexOf(param);
  const callback = directArgument(fn);
  if (callback) return readCallback(env, callback, index, path, inputs);
  if (inputs.has(fn)) return readArgument(env, inputs.get(fn)[index], param, path, inputs);
  const declared = declaredQueryType(env, param.type, path) ??
    contextualQueryType(env, fn, index, path);
  if (declared) return declared;
  const uses = env.functionUsesCached(fn);
  const values = uses.map(reference => readParameterUse(env, reference, index, param, path, inputs))
    .filter(value => value !== undefined);
  const origin = mergeOrigins(values);
  if (!origin && values.includes(CLIENT)) return AMBIGUOUS_CLIENT;
  return origin;
}

function readParameterUse(env, reference, index, param, path, inputs) {
  const site = directArgument(reference);
  if (site) return readCallback(env, site, index, path, inputs);
  const call = calledAt(reference);
  return call === undefined ? undefined : call && readArgument(env, call.arguments[index], param, path, inputs);
}

function readArgument(env, value, param, path, inputs) {
  if (value && !ts.isSpreadElement(value)) return env.read(value, path, inputs);
  return !value && param.initializer ? env.read(param.initializer, path, inputs) : null;
}

function readCallback(env, { call, index }, param, path, inputs) {
  const callee = ts.skipOuterExpressions(call.expression);
  const read = (node, keys) => env.read(node, keys, inputs);
  const origin = read(callee, []);
  if (index === 1 && param === 0 && origin === ENTRY) return path.length ? null : CLIENT;
  if (index === 0 && param === 0 && origin === 'better-auth/api#createAuthMiddleware')
    return path[0] === 'query' ? DATA : null;
  return index === 0 && param === 0 ? readMethodCallback(callee, path, read) : null;
}

function readMethodCallback(callee, path, read) {
  const member = memberKey(callee);
  if (member === 'transaction' && read(callee.expression, []) === CLIENT)
    return path.length ? null : CLIENT;
  if (member === 'map' || member === 'filter') return read(callee.expression, [ITEM, ...path]);
  return null;
}

function readCall(env, node, path, inputs) {
  const callee = ts.skipOuterExpressions(node.expression);
  const [arg] = node.arguments;
  const member = memberKey(callee);
  if (callee.kind === ts.SyntaxKind.ImportKeyword && arg && ts.isStringLiteral(arg))
    return dynamicImport(env, node, arg.text, path, inputs);
  const builtin = member === null ? undefined : readBuiltin(env, node, callee, member, path, inputs);
  if (builtin !== undefined) return builtin;
  const fn = env.read(callee, [], inputs);
  if (!fn || typeof fn !== 'object' || !isFunctionLike(fn)) return null;
  return readReturn(env, fn, path, new Map([...inputs, [fn, node.arguments]]));
}

function readBuiltin(env, node, callee, member, path, inputs) {
  const [arg] = node.arguments;
  const read = (value, keys = path) => env.read(value, keys, inputs);
  if (
    member === 'parse' && env.isGlobal(callee.expression, 'JSON') &&
    node.arguments.length === 1 && !ts.isSpreadElement(arg)
  )
    return DATA;
  if (member === 'freeze' && env.isGlobal(callee.expression, 'Object')) return read(arg);
  if (member === 'filter' && path[0] === ITEM) return read(callee.expression);
  if (member === 'map' && path[0] === ITEM) {
    if (!read(callee.expression, [ITEM])) return null;
    return readReturn(env, read(arg, []), path.slice(1), inputs);
  }
  if (member === 'get') return read(callee.expression, [MAP_VALUE, ...path]);
  return undefined;
}

function dynamicImport(env, node, specifier, [key, ...rest], inputs) {
  if (typeof key !== 'string') return null;
  const origins = env.graph.resolveImport(node.getSourceFile().fileName, specifier, key);
  return mergeOrigins(origins.map(origin => readOrigin(env, origin, rest, inputs)));
}

function readReturn(env, fn, path, inputs) {
  if (!fn || typeof fn !== 'object' || !isFunctionLike(fn)) return null;
  return mergeOrigins(returnsOf(fn).map(node => env.read(node, path, inputs)));
}

function readNew(env, node, path, inputs) {
  const [arg] = node.arguments ?? [];
  if (path[0] === MAP_VALUE && env.isGlobal(node.expression, 'Map'))
    return env.read(arg, [ITEM, '1', ...path.slice(1)], inputs);
  const callee = env.read(node.expression, [], inputs);
  return PG.has(callee) && path[0] === 'query' && path.length === 1 ? DATA : null;
}
