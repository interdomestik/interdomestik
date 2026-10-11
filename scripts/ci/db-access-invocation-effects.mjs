import ts from 'typescript';
import { isFunction, unwrap } from './db-access-source.mjs';
import { ownReturns } from './db-access-invocation-shapes.mjs';

// Ordered capture-plan marker for a this/super receiver reference inside a captured body.
const RECEIVER_CAPTURE = Symbol('effect-receiver-capture');

export function walkOwned(root, visit) {
  function walk(node) {
    visit(node);
    if (node !== root && isFunction(node)) return;
    ts.forEachChild(node, walk);
  }
  walk(root);
}

export function writtenValue(node) {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  )
    return node.left;
  if (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
  )
    return node.operand;
  if (
    (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
    !ts.isVariableDeclarationList(node.initializer)
  )
    return node.initializer;
}

// This is evidence, not a handle/purity classifier. Bound parameters retain their actual caller
// context. Unknown/default/spread paths remain explicit and never become canonical provenance.
//
// Capture plans cache static syntax only: per function body, the exact model.walk-ordered sequence
// of receiver markers and free identifier references (nested functions and duplicates included)
// selected through the immutable model. A plan lives only as long as this effects instance. Every
// capture still records its function, evaluates default initializers in parameter order and visits
// every planned reference with its current frame, the call's own step budget and cycle state, and
// the live resolver. No origin, resolution, binding, frame, escape or mutation answer is cached.
// The first capture of a body performs the original interleaved walk; its plan is stored only after
// that walk completes, so an error propagates unchanged and leaves no partial plan.
export function createInvocationEffects(model, resolver, maxSteps = 512) {
  const capturePlans = new WeakMap();
  // Property names and declaration bindings are not free value references. Shorthand property
  // assignments are references; model.declaration resolves their value symbol.
  function captureEvent(fn, node) {
    if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword)
      return RECEIVER_CAPTURE;
    if (!ts.isIdentifier(node)) return undefined;
    const parent = node.parent;
    if (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (parent.name === node && !ts.isShorthandPropertyAssignment(parent))
    )
      return undefined;
    const decl = model.declaration(node);
    for (let scope = decl; scope; scope = scope.parent) if (scope === fn) return undefined;
    return node;
  }
  function origins(raw, context) {
    const values = [],
      functions = [],
      unknown = [];
    let steps = 0;
    const seen = new Map();
    function visit(rawNode, frame) {
      const node = unwrap(rawNode);
      if (!node) return;
      if (++steps > maxSteps) {
        unknown.push('effect-budget-exceeded');
        return;
      }
      const contexts = seen.get(node) ?? new Set();
      if (contexts.has(frame)) {
        unknown.push('effect-cycle');
        return;
      }
      seen.set(node, new Set(contexts).add(frame));
      try {
        follow(node, frame);
      } finally {
        seen.get(node).delete(frame);
      }
    }
    function follow(node, frame) {
      if (ts.isConditionalExpression(node)) {
        visit(node.whenTrue, frame);
        visit(node.whenFalse, frame);
        return;
      }
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        visit(node.left, frame);
        visit(node.right, frame);
        return;
      }
      if (
        ts.isStringLiteral(node) ||
        ts.isNumericLiteral(node) ||
        ts.isBigIntLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
          node.kind
        )
      )
        return;
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        visit(node.expression, frame);
        return;
      }
      if (ts.isObjectLiteralExpression(node)) {
        for (const item of node.properties) {
          if (item.name && ts.isComputedPropertyName(item.name)) {
            unknown.push('effect-computed-property');
            visit(item.name.expression, frame);
          }
          if (ts.isGetAccessorDeclaration(item) || ts.isSetAccessorDeclaration(item))
            unknown.push('effect-accessor');
          if (ts.isPropertyAssignment(item)) visit(item.initializer, frame);
          else if (ts.isShorthandPropertyAssignment(item)) visit(item.name, frame);
          else if (ts.isSpreadAssignment(item)) {
            unknown.push('effect-spread');
            visit(item.expression, frame);
          } else if (isFunction(item)) capture(item, frame);
        }
        return;
      }
      if (ts.isArrayLiteralExpression(node)) {
        node.elements.forEach(item => visit(item, frame));
        return;
      }
      if (isFunction(node)) {
        capture(node, frame);
        return;
      }
      const decl = model.declaration(node);
      if (decl && ts.isParameter(decl)) {
        const binding = resolver.bindingsFor(frame)?.find(item => item.parameter === decl);
        if (binding) visit(binding.argument, binding.callerContext);
        else {
          values.push({ node, context: frame });
          unknown.push('unbound-effect-parameter');
        }
      } else if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
        values.push({ node, context: frame });
        if (!(decl.parent.flags & ts.NodeFlags.Const)) unknown.push('effect-mutable-alias');
        visit(decl.initializer, frame);
      } else if (ts.isIdentifier(node)) {
        values.push({ node, context: frame });
        if (decl && isFunction(decl)) visit(decl, frame);
        else unknown.push('unresolved-effect-identifier');
      } else if (ts.isCallExpression(node)) {
        values.push({ node, context: frame });
        const result = resolver.resolveCall(node, frame);
        if (result.unknown) unknown.push('effect-call-result');
        for (const target of result.targets) {
          const body = target.functionNode.body;
          if (ts.isBlock(body)) {
            for (const statement of ownReturns(body)) visit(statement.expression, target.context);
          } else visit(body, target.context);
        }
      } else unknown.push(`unsupported-effect:${ts.SyntaxKind[node.kind]}`);
    }
    function perform(event, frame) {
      if (event === RECEIVER_CAPTURE) unknown.push('effect-receiver-capture');
      else visit(event, frame);
    }
    function capture(fn, frame) {
      functions.push({ node: fn, context: frame });
      for (const parameter of fn.parameters) {
        if (parameter.initializer) {
          unknown.push('effect-default-parameter');
          visit(parameter.initializer, frame);
        }
      }
      const plan = capturePlans.get(fn);
      if (plan) {
        for (const event of plan) perform(event, frame);
        return;
      }
      const events = [];
      model.walk(fn.body, node => {
        const event = captureEvent(fn, node);
        if (event === undefined) return;
        events.push(event);
        perform(event, frame);
      });
      if (!capturePlans.has(fn)) capturePlans.set(fn, Object.freeze(events));
    }
    visit(raw, context);
    return { values, functions, unknown: [...new Set(unknown)] };
  }
  return { origins };
}
