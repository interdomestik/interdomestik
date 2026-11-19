// CHK-05 provenance (design §6.3, r3 B4): what counts as parsed input. `S.parse(x)` /
// `S.parseAsync(x)` with a strict-object schema; `R.data` after `if (!R.success) return|throw`; the
// first parameter of a wrapper handler; member paths and const aliases of those. Nothing else.
import ts from 'typescript';

import { importsOf, resolveModule, textOf, unwrap } from './ast.mjs';
import { memberSchema, openReasons, rootProblem } from './chk05-schema.mjs';

const FACTORIES = new Set(['defineAction', 'defineFormAction']);
const WRAPPER_MODULE = 'apps/web/src/lib/safe-action.ts';

// The callee is the wrapper's factory, imported from the wrapper module (not a same-named helper).
function isWrapperFactory(call, ctx) {
  if (!ts.isIdentifier(call.expression)) return false;
  const imported = importsOf(call.getSourceFile()).get(call.expression.text);
  return (
    Boolean(imported) &&
    FACTORIES.has(imported.imported) &&
    resolveModule(ctx.root, ctx.file, imported.specifier) === WRAPPER_MODULE
  );
}

const hasInputSchema = object =>
  object.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText() === 'input');
const PARSE = new Set(['parse', 'parseAsync']);
const SAFE_PARSE = new Set(['safeParse', 'safeParseAsync']);

function parameterBinding(scope, name) {
  if (!ts.isFunctionLike(scope)) return null;
  const index = scope.parameters.findIndex(p => ts.isIdentifier(p.name) && p.name.text === name);
  return index >= 0 ? { kind: 'param', fn: scope, index } : null;
}

const isNamedElement = (element, name) =>
  ts.isIdentifier(element.name) && element.name.text === name && !element.dotDotDotToken;

// undefined: the declaration does not bind the name; null: it binds it, but not as a const.
function declarationBinding(decl, name, isConst) {
  if (ts.isIdentifier(decl.name) && decl.name.text === name)
    return isConst ? { kind: 'const', decl } : null;
  if (!ts.isObjectBindingPattern(decl.name)) return undefined;
  const element = decl.name.elements.find(candidate => isNamedElement(candidate, name));
  if (!element) return undefined;
  return isConst
    ? { kind: 'const', decl, key: (element.propertyName ?? element.name).getText() }
    : null;
}

function statementsBinding(scope, name) {
  const statements = ts.isBlock(scope) || ts.isSourceFile(scope) ? scope.statements : [];
  for (const statement of statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const isConst = Boolean(statement.declarationList.flags & ts.NodeFlags.Const);
    for (const decl of statement.declarationList.declarations) {
      const binding = declarationBinding(decl, name, isConst);
      if (binding !== undefined) return binding;
    }
  }
  return undefined;
}

// The nearest binding of an identifier: a const declaration (maybe destructured) or a parameter.
export function lookup(identifier) {
  const name = identifier.text;
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    const parameter = parameterBinding(scope, name);
    if (parameter) return parameter;
    const binding = statementsBinding(scope, name);
    if (binding !== undefined) return binding;
  }
  return null;
}

function isHandlerParameter(fn, index, ctx) {
  if (index !== 0) return false;
  const holder = fn.parent;
  const isHandler =
    (ts.isPropertyAssignment(holder) &&
      holder.name.getText() === 'handler' &&
      unwrap(holder.initializer) === fn) ||
    (ts.isMethodDeclaration(fn) && fn.name.getText() === 'handler');
  const object = ts.isMethodDeclaration(fn) ? fn.parent : holder?.parent;
  const call = object && ts.isObjectLiteralExpression(object) ? object.parent : null;
  return (
    isHandler &&
    Boolean(call) &&
    ts.isCallExpression(call) &&
    isWrapperFactory(call, ctx) &&
    hasInputSchema(object)
  );
}

const isGuard = (statement, name) => {
  if (!ts.isIfStatement(statement)) return false;
  const condition = textOf(statement.expression);
  if (condition !== `!${name}.success` && condition !== `${name}.success === false`) return false;
  const then = statement.thenStatement;
  const exits = node => ts.isReturnStatement(node) || ts.isThrowStatement(node);
  return exits(then) || (ts.isBlock(then) && then.statements.some(exits));
};

// A guard `if (!R.success) return|throw` precedes the use in a block that encloses it.
function guarded(use, name) {
  for (let node = use; node.parent; node = node.parent) {
    const parent = node.parent;
    if (!(ts.isBlock(parent) || ts.isSourceFile(parent))) continue;
    const index = parent.statements.indexOf(node);
    if (parent.statements.slice(0, index).some(statement => isGuard(statement, name))) return true;
  }
  return false;
}

function schemaVerdict(schemaNode, path, ctx) {
  const problem = rootProblem(schemaNode, ctx.file, ctx.resolveSchema);
  if (problem) return problem;
  let target = { expression: schemaNode, file: ctx.file };
  if (path.length) {
    let base = unwrap(schemaNode);
    let at = ctx.file;
    if (ts.isIdentifier(base)) {
      const hit = ctx.resolveSchema(base, ctx.file);
      base = hit?.init;
      at = hit?.file;
    }
    target = base && memberSchema(base, at, path, ctx.resolveSchema);
    if (!target) return 'spread member not found in the schema';
  }
  const open = openReasons(target.expression, target.file, ctx.resolveSchema);
  return open.length ? `spread path: ${[...new Set(open)].join(', ')}` : null;
}

function safeParseCall(identifier) {
  const binding = lookup(identifier);
  const init = binding?.kind === 'const' && !binding.key && unwrap(binding.decl.initializer);
  const isSafeParse =
    init &&
    ts.isCallExpression(init) &&
    ts.isPropertyAccessExpression(init.expression) &&
    SAFE_PARSE.has(init.expression.name.text);
  return isSafeParse ? init : null;
}

function memberProblem(value, ctx, path, depth) {
  const base = unwrap(value.expression);
  const init = value.name.text === 'data' && ts.isIdentifier(base) ? safeParseCall(base) : null;
  if (init) {
    if (!guarded(value, base.text)) return `${base.text}.data without a preceding success guard`;
    return schemaVerdict(init.expression.expression, path, ctx);
  }
  return provenanceProblem(value.expression, ctx, [value.name.text, ...path], depth + 1);
}

function callProblem(value, ctx, path) {
  const method = value.expression.name.text;
  const receiver = unwrap(value.expression.expression);
  if (PARSE.has(method) && !(ts.isIdentifier(receiver) && receiver.text === 'JSON'))
    return schemaVerdict(receiver, path, ctx);
  return `call ${textOf(value.expression)} is not a parse`;
}

function identifierProblem(value, ctx, path, depth) {
  const binding = lookup(value);
  if (binding?.kind === 'param')
    return isHandlerParameter(binding.fn, binding.index, ctx) ? null : `parameter ${value.text}`;
  if (binding?.kind !== 'const' || !binding.decl.initializer) return `unbound ${value.text}`;
  const nextPath = binding.key ? [binding.key, ...path] : path;
  return provenanceProblem(binding.decl.initializer, ctx, nextPath, depth + 1);
}

// null when the expression carries parsed provenance, else the reason it does not.
export function provenanceProblem(expression, ctx, path = [], depth = 0) {
  if (depth > 16) return 'provenance chain too long';
  const value = unwrap(expression);
  if (!value) return 'no value';
  if (ts.isPropertyAccessExpression(value)) return memberProblem(value, ctx, path, depth);
  if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression))
    return callProblem(value, ctx, path);
  if (ts.isIdentifier(value)) return identifierProblem(value, ctx, path, depth);
  return `expression ${textOf(value).slice(0, 40)} has no provenance`;
}
