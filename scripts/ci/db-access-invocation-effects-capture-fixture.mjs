import assert from 'node:assert/strict';
import ts from 'typescript';
import { createSourceModel, isFunction, unwrap } from './db-access-source.mjs';
import { ownReturns } from './db-access-invocation-shapes.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';
import { createInvocationEffects } from './db-access-invocation-effects.mjs';

// Frozen differential reference: the createInvocationEffects body reviewed at frozen34 v5, before
// capture plans, copied verbatim. Do not edit it to follow later production behaviour.
function createReferenceInvocationEffects(model, resolver, maxSteps = 512) {
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
    function capture(fn, frame) {
      functions.push({ node: fn, context: frame });
      for (const parameter of fn.parameters) {
        if (parameter.initializer) {
          unknown.push('effect-default-parameter');
          visit(parameter.initializer, frame);
        }
      }
      model.walk(fn.body, node => {
        if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword)
          unknown.push('effect-receiver-capture');
        if (!ts.isIdentifier(node)) return;
        // Property names and declaration bindings are not free value references. Shorthand
        // property assignments are references; model.declaration resolves their value symbol.
        const parent = node.parent;
        if (
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (parent.name === node && !ts.isShorthandPropertyAssignment(parent))
        )
          return;
        const decl = model.declaration(node);
        for (let scope = decl; scope; scope = scope.parent) if (scope === fn) return;
        visit(node, frame);
      });
    }
    visit(raw, context);
    return { values, functions, unknown: [...new Set(unknown)] };
  }
  return { origins };
}

const FILE = 'apps/web/src/effect-capture.ts';

// One actual source model and resolver shared by the frozen reference and the candidate. Each side
// gets a counting view of model.walk and of the resolver methods it consumes; frames and context
// tokens come only from actual resolveCall results.
export function harness(source, { maxSteps = 512 } = {}) {
  const model = createSourceModel(new Map([[FILE, source]]));
  const ids = new Map();
  model.walk(model.parsed.get(FILE), node => {
    ids.set(node, `${ids.size}:${ts.SyntaxKind[node.kind]}`);
  });
  const live = { mutated: new Set(), escaped: new Set(), fail: undefined };
  const resolver = createLocalInvocations(model, {
    isMutated: node => live.mutated.has(node),
    isEscaped: node => live.escaped.has(node),
  });
  function find(predicate) {
    for (const node of ids.keys()) if (predicate(node)) return node;
    return assert.fail('fixture node not found');
  }
  const call = text => find(node => ts.isCallExpression(node) && node.getText() === text);
  const returned = text =>
    find(node => ts.isIdentifier(node) && node.text === text && ts.isReturnStatement(node.parent));
  function declared(text) {
    const node = find(
      item =>
        (ts.isVariableDeclaration(item) || ts.isFunctionDeclaration(item)) &&
        item.name?.getText() === text
    );
    return ts.isVariableDeclaration(node) ? node.initializer : node;
  }
  const known = new Map([[undefined, 'root']]);
  function name(token, label) {
    assert.ok(token, label);
    known.set(token, label);
    return token;
  }
  function target(text) {
    const result = resolver.resolveCall(call(text));
    assert.equal(result.unknown, false, String(result.reasons));
    return result.targets[0];
  }
  const contexts = new Map();
  function context(text) {
    if (!contexts.has(text)) contexts.set(text, name(target(text).context, text));
    return contexts.get(text);
  }
  function instrument(factory) {
    const counts = { walks: 0, walked: 0, resolveCall: 0, bindingsFor: 0 };
    const view = Object.create(model, {
      walk: {
        value(root, callback) {
          counts.walks += 1;
          model.walk(root, node => {
            counts.walked += 1;
            callback(node);
          });
        },
      },
    });
    const observed = Object.freeze({
      resolveCallable: expression => resolver.resolveCallable(expression),
      resolveCall(node, callerContext) {
        counts.resolveCall += 1;
        return resolver.resolveCall(node, callerContext);
      },
      bindingsFor(token) {
        counts.bindingsFor += 1;
        if (live.fail) throw live.fail;
        return resolver.bindingsFor(token);
      },
    });
    return { counts, effects: factory(view, observed, maxSteps) };
  }
  const id = node => ids.get(node) ?? `foreign:${ts.SyntaxKind[node.kind]}`;
  // Exact node identity; named tokens by identity; fresh tokens by first appearance plus their
  // actual parameter/argument bindings.
  function snapshot(result) {
    const fresh = new Map();
    function label(token) {
      if (known.has(token)) return known.get(token);
      if (!fresh.has(token)) {
        const bindings = (resolver.bindingsFor(token) ?? [])
          .map(item => `${id(item.parameter)}=${id(item.argument)}`)
          .join(',');
        fresh.set(token, `fresh:${fresh.size}[${bindings}]`);
      }
      return fresh.get(token);
    }
    const entry = item => `${id(item.node)}@${label(item.context)}`;
    return {
      values: result.values.map(entry),
      functions: result.functions.map(entry),
      unknown: [...result.unknown],
    };
  }
  const reference = instrument(createReferenceInvocationEffects);
  const candidate = instrument(createInvocationEffects);
  let turn = 0;
  function origins(raw, ctx) {
    const order = turn++ % 2 ? [candidate, reference] : [reference, candidate];
    const results = new Map();
    for (const side of order) results.set(side, side.effects.origins(raw, ctx));
    const actual = snapshot(results.get(candidate));
    assert.deepEqual(actual, snapshot(results.get(reference)));
    assert.equal(candidate.counts.resolveCall, reference.counts.resolveCall);
    assert.equal(candidate.counts.bindingsFor, reference.counts.bindingsFor);
    return { result: results.get(candidate), snapshot: actual };
  }
  return {
    live,
    resolver,
    find,
    call,
    returned,
    declared,
    name,
    target,
    context,
    instrument,
    reference,
    candidate,
    origins,
  };
}
