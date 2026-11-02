// Tenant guard stage: query receivers and cross-file references.

import ts from 'typescript';
import { originKey } from './modules.mjs';
import { byCodeUnit } from './rules-digest.mjs';

/** Installs the query-receiver analysis and reference lookup on `ctx`. */
export function installReceivers(ctx) {
  const {
    BUILDER_CLIENTS,
    BUILDER_METHODS,
    SPREAD,
    UNKNOWN_KEY,
    allIn,
    boundProperty,
    factsOf,
    functionTargets,
    handOffProblem,
    identifierOrigins,
    isTest,
    isWriteTarget,
    keyOf,
    originsOf,
    outermost,
    propertyNameOf,
    receiverSink,
    referenceAt,
    restCarries,
    returnsOf,
    sources,
    unwrap,
    usesOf,
  } = ctx;

  /** Null when `expression` (read at `path`) is a recognized receiver, else why it is not. */
  function receiverProblem(fact, expression, path = [], seen = new Set()) {
    const node = unwrap(expression);
    const unknown = `an unknown receiver (${node.getText(fact.sourceFile).slice(0, 40)})`;
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (
        path.length === 0 &&
        ts.isPropertyAccessExpression(callee) &&
        BUILDER_METHODS.has(callee.name.text)
      ) {
        return receiverProblem(fact, callee.expression, [], seen);
      }
      // A function result: every value it can return.
      const targets = functionTargets(fact, node.expression);
      if (!targets || targets.length === 0) return unknown;
      for (const target of targets) {
        for (const returned of returnsOf(target.fn)) {
          const problem = receiverProblem(target.fact, returned, path, seen);
          if (problem) return problem;
        }
      }
      return null;
    }
    if (ts.isAwaitExpression(node)) return receiverProblem(fact, node.expression, path, seen);
    if (ts.isPropertyAccessExpression(node))
      return receiverProblem(fact, node.expression, [node.name.text, ...path], seen);
    if (ts.isConditionalExpression(node))
      return (
        receiverProblem(fact, node.whenTrue, path, seen) ??
        receiverProblem(fact, node.whenFalse, path, seen)
      );
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      return (
        receiverProblem(fact, node.left, path, seen) ??
        receiverProblem(fact, node.right, path, seen)
      );
    }
    // A facade of bound builder methods, `{ insert: tx.insert.bind(tx), … }`, on a recognized tx.
    if (ts.isObjectLiteralExpression(node) && path.length === 0) {
      if (node.properties.length === 0) return unknown;
      for (const property of node.properties) {
        const name = ts.isPropertyAssignment(property) ? propertyNameOf(property.name) : null;
        const bound = name && unwrap(property.initializer);
        const bind = bound && ts.isCallExpression(bound) && unwrap(bound.expression);
        const method =
          bind && ts.isPropertyAccessExpression(bind) && bind.name.text === 'bind'
            ? unwrap(bind.expression)
            : null;
        const self = method && ts.isPropertyAccessExpression(method) && unwrap(method.expression);
        const thisArgument = bound?.arguments?.length === 1 && unwrap(bound.arguments[0]);
        if (
          !BUILDER_METHODS.has(name) ||
          !self ||
          method.name.text !== name ||
          !ts.isIdentifier(self) ||
          !thisArgument ||
          !ts.isIdentifier(thisArgument) ||
          self.text !== thisArgument.text
        ) {
          return unknown;
        }
        const problem = receiverProblem(fact, self, [], seen);
        if (problem) return problem;
      }
      return null;
    }
    if (ts.isObjectLiteralExpression(node) && path.length > 0) {
      const [name, ...rest] = path;
      // Walking back from the last member: a spread may or may not carry the property, so what it
      // carries is checked and the walk continues to the earlier members; an explicit member ends
      // it, and a computed key that is not a literal may write the property and is refused.
      for (const property of [...node.properties].reverse()) {
        const key = keyOf(property);
        if (key === UNKNOWN_KEY) return unknown;
        if (key === SPREAD) {
          const problem = receiverProblem(fact, property.expression, path, seen);
          if (problem) return problem;
          continue;
        }
        if (key !== name) continue;
        if (ts.isShorthandPropertyAssignment(property))
          return receiverProblem(fact, property.name, rest, seen);
        if (ts.isPropertyAssignment(property))
          return receiverProblem(fact, property.initializer, rest, seen);
        return unknown;
      }
      return null; // otherwise never set: the receiver is undefined, which no builder call accepts
    }
    if (!ts.isIdentifier(node)) return unknown;
    const reference = referenceAt(fact, node);
    const binding = reference?.binding;
    if (!binding) return unknown;
    if (binding.kind === 'import')
      return path.length === 0 && allIn(identifierOrigins(fact, node), BUILDER_CLIENTS)
        ? null
        : unknown;
    // A cycle adds no value source of its own: the other sources decide.
    const mark = `${fact.file}:${binding.id.pos}:${path.join('.')}`;
    if (seen.has(mark)) return null;
    seen.add(mark);
    if (binding.kind === 'var') {
      const declaration = binding.decl;
      const property =
        declaration.name === binding.id ? null : boundProperty(declaration.name, binding.id);
      if (declaration.name !== binding.id && property === null) return unknown;
      if (property === '...' && path.length > 0 && !restCarries(declaration.name, path[0]))
        return null; // the rest omits it: undefined
      const at = property === null || property === '...' ? path : [property, ...path];
      if ((declaration.parent.flags & ts.NodeFlags.Const) !== 0) {
        return declaration.initializer
          ? receiverProblem(fact, declaration.initializer, at, seen)
          : unknown;
      }
      if ((declaration.parent.flags & ts.NodeFlags.Let) === 0 || property !== null) return unknown;
      // `let`: the initializer and every plain assignment.
      if (declaration.initializer) {
        const problem = receiverProblem(fact, declaration.initializer, path, seen);
        if (problem) return problem;
      }
      for (const use of usesOf(fact, binding)) {
        const target = outermost(use.node);
        if (!isWriteTarget(target)) continue;
        const assignment = target.parent;
        if (
          !ts.isBinaryExpression(assignment) ||
          assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        ) {
          return unknown;
        }
        const problem = receiverProblem(fact, assignment.right, path, seen);
        if (problem) return problem;
      }
      return null;
    }
    if (binding.kind !== 'param') return unknown;
    const fn = binding.decl;
    const index = fn.parameters.findIndex(
      parameter => parameter.name === binding.id || boundProperty(parameter.name, binding.id)
    );
    const parameter = fn.parameters[index];
    if (!parameter || parameter.dotDotDotToken) return unknown;
    const property =
      parameter.name === binding.id ? null : boundProperty(parameter.name, binding.id);
    if (property === '...' && path.length > 0 && !restCarries(parameter.name, path[0])) return null;
    const at = property === null || property === '...' ? path : [property, ...path];
    const declared = declaredFunction(fact, fn);
    if (declared) receiverSink({ kind: 'param', fact, fn, index, path: at, declared });
    // A function that is also a call argument (`const f = wrap(fn)`) is handed on as well.
    const wrapped = outermost(fn).parent;
    if (declared && !(ts.isCallExpression(wrapped) && wrapped.arguments.includes(outermost(fn))))
      return null;
    const handOff = handOffProblem(fact, fn, index, at);
    return handOff ? `${unknown}: ${handOff}` : null;
  }

  /** How callers reach `fn`: its top-level key, or its local binding declaration. */
  function declaredFunction(fact, fn) {
    for (const [name, unit] of fact.declarations) {
      if (unit === fn) return { key: `${fact.file}#${name}` };
    }
    if (ts.isFunctionDeclaration(fn) && fn.name) return { local: fn };
    const declaration = outermost(fn).parent;
    if (
      ts.isVariableDeclaration(declaration) &&
      ts.isIdentifier(declaration.name) &&
      (declaration.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      return { local: declaration };
    }
    return null;
  }

  let originIndex = null;
  function referencesTo(key) {
    if (!originIndex) {
      originIndex = new Map();
      for (const file of [...sources.keys()].sort(byCodeUnit)) {
        if (isTest(file) || /\.d\.[cm]?ts$/u.test(file)) continue;
        const fact = factsOf(file);
        if (!fact) continue;
        for (const reference of fact.references) {
          if (!reference.binding) continue;
          const { origins, form } = originsOf(fact, reference);
          for (const origin of origins) {
            const originName = originKey(origin);
            if (!originName) continue;
            if (!originIndex.has(originName)) originIndex.set(originName, []);
            originIndex.get(originName).push({ fact, reference, form });
          }
        }
      }
    }
    return originIndex.get(key) ?? [];
  }
  Object.assign(ctx, { declaredFunction, receiverProblem, referencesTo });
}
