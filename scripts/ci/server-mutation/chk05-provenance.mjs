// CHK-05 provenance (design §6.3, r3 B4): what counts as parsed input. `S.parse(x)` /
// `S.parseAsync(x)` with a strict-object schema; `R.data` after `if (!R.success) return|throw`; the
// first parameter of a wrapper handler; member paths and const aliases of those. Nothing else.
import ts from 'typescript';

import { textOf, unwrap } from './ast.mjs';
import { memberSchema, openReasons, rootProblem } from './chk05-schema.mjs';

const FACTORIES = new Set(['defineAction', 'defineFormAction']);
const PARSE = new Set(['parse', 'parseAsync']);
const SAFE_PARSE = new Set(['safeParse', 'safeParseAsync']);

// The nearest binding of an identifier: a const declaration (maybe destructured) or a parameter.
export function lookup(identifier) {
  const name = identifier.text;
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope)) {
      const index = scope.parameters.findIndex(
        p => ts.isIdentifier(p.name) && p.name.text === name
      );
      if (index >= 0) return { kind: 'param', fn: scope, index };
    }
    const statements = ts.isBlock(scope) || ts.isSourceFile(scope) ? scope.statements : null;
    for (const statement of statements ?? []) {
      if (!ts.isVariableStatement(statement)) continue;
      const isConst = Boolean(statement.declarationList.flags & ts.NodeFlags.Const);
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name)
          return isConst ? { kind: 'const', decl } : null;
        if (ts.isObjectBindingPattern(decl.name))
          for (const element of decl.name.elements)
            if (
              ts.isIdentifier(element.name) &&
              element.name.text === name &&
              !element.dotDotDotToken
            )
              return isConst
                ? { kind: 'const', decl, key: (element.propertyName ?? element.name).getText() }
                : null;
      }
    }
  }
  return null;
}

function isHandlerParameter(fn, index) {
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
    ts.isIdentifier(call.expression) &&
    FACTORIES.has(call.expression.text)
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

// null when the expression carries parsed provenance, else the reason it does not.
export function provenanceProblem(expression, ctx, path = [], depth = 0) {
  if (depth > 16) return 'provenance chain too long';
  const value = unwrap(expression);
  if (!value) return 'no value';
  if (ts.isPropertyAccessExpression(value)) {
    const base = unwrap(value.expression);
    if (value.name.text === 'data' && ts.isIdentifier(base)) {
      const binding = lookup(base);
      const init = binding?.kind === 'const' && !binding.key && unwrap(binding.decl.initializer);
      if (
        init &&
        ts.isCallExpression(init) &&
        ts.isPropertyAccessExpression(init.expression) &&
        SAFE_PARSE.has(init.expression.name.text)
      ) {
        if (!guarded(value, base.text))
          return `${base.text}.data without a preceding success guard`;
        return schemaVerdict(init.expression.expression, path, ctx);
      }
    }
    return provenanceProblem(value.expression, ctx, [value.name.text, ...path], depth + 1);
  }
  if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)) {
    const method = value.expression.name.text;
    const receiver = unwrap(value.expression.expression);
    if (PARSE.has(method) && !(ts.isIdentifier(receiver) && receiver.text === 'JSON'))
      return schemaVerdict(receiver, path, ctx);
    return `call ${textOf(value.expression)} is not a parse`;
  }
  if (ts.isIdentifier(value)) {
    const binding = lookup(value);
    if (binding?.kind === 'param')
      return isHandlerParameter(binding.fn, binding.index) ? null : `parameter ${value.text}`;
    if (binding?.kind !== 'const' || !binding.decl.initializer) return `unbound ${value.text}`;
    const nextPath = binding.key ? [binding.key, ...path] : path;
    return provenanceProblem(binding.decl.initializer, ctx, nextPath, depth + 1);
  }
  return `expression ${textOf(value).slice(0, 40)} has no provenance`;
}
