import ts from 'typescript';
import { createClientSymbols } from './db-access-client-symbols.mjs';
import { isFunction, ownerOf, unwrap } from './db-access-source.mjs';
import { collectMutationEffects } from './db-access-mutations.mjs';
import { createDispatch } from './db-access-dispatch.mjs';
import { createContextualProvenance } from './db-access-contextual.mjs';
import { canonicalQueryChain } from './db-access-inventory.mjs';
import { withInvocationEvidence } from './db-access-invocation-evidence.mjs';
import { createProvenanceBudget } from './db-access-provenance-budget.mjs';

const UNKNOWN = 'unknown';
const DB_FILE = 'packages/database/src/db.ts';
export function createProvenance(model) {
  const {
    calls,
    mutations,
    unsafeMutations,
    escapedFns,
    isMutated,
    environmentChanges,
    analysisUnknown,
    finish,
  } = collectMutationEffects(model);
  const work = createProvenanceBudget(analysisUnknown);
  const { clientIdentity, canonical } = createClientSymbols(model, mutations);
  const handleUnion = values => {
    if (values.includes(true)) return true;
    if (values.includes(UNKNOWN)) return UNKNOWN;
    return false;
  };
  function tenantHandle(raw, seen = new Set(), budget = { remaining: 2048 }) {
    const node = unwrap(raw);
    if (!node) return false;
    if (--budget.remaining < 0) return UNKNOWN;
    if (!work.enter() || seen.has(node) || seen.size > 64) return UNKNOWN;
    seen = new Set(seen).add(node);
    if (provenance(node) === 'tenant-context') return true;
    if (ts.isAwaitExpression(node)) return tenantHandle(node.expression, seen, budget);
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.CommaToken)
        return tenantHandle(node.right, seen, budget);
      if (
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.EqualsToken,
        ].includes(node.operatorToken.kind)
      )
        return handleUnion([
          tenantHandle(node.left, seen, budget),
          tenantHandle(node.right, seen, budget),
        ]);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return tenantHandle(node.expression, seen, budget);
    if (ts.isObjectLiteralExpression(node))
      return handleUnion(
        node.properties.map(item => {
          let value;
          if (ts.isPropertyAssignment(item)) value = item.initializer;
          else if (ts.isShorthandPropertyAssignment(item)) value = item.name;
          else if (ts.isSpreadAssignment(item)) value = item.expression;
          return tenantHandle(value, seen, budget);
        })
      );
    if (ts.isArrayLiteralExpression(node))
      return handleUnion(node.elements.map(item => tenantHandle(item, seen, budget)));
    if (ts.isSpreadElement(node)) return tenantHandle(node.expression, seen, budget);
    if (ts.isConditionalExpression(node))
      return handleUnion([
        tenantHandle(node.whenTrue, seen, budget),
        tenantHandle(node.whenFalse, seen, budget),
      ]);
    // Writes invalidate the initializer, but a known handle still wins over UNKNOWN.
    const stale = isMutated(node) ? UNKNOWN : false;
    let holder = model.declaration(node);
    while (holder && ts.isBindingElement(holder)) holder = holder.parent.parent;
    if (holder && ts.isVariableDeclaration(holder) && ts.isForOfStatement(holder.parent.parent))
      return handleUnion([tenantHandle(holder.parent.parent.expression, seen, budget), stale]);
    if (holder && ts.isVariableDeclaration(holder) && holder.initializer)
      return handleUnion([tenantHandle(holder.initializer, seen, budget), stale]);
    if (holder && ts.isParameter(holder))
      return handleUnion([parameterHandle(holder, seen, budget), stale]);
    return stale;
  }
  function parameterHandle(parameter, seen, budget) {
    if (!work.enter()) return UNKNOWN;
    const fn = parameter.parent;
    const index = fn.parameters.indexOf(parameter);
    // An opaque call can taint provenance without making the original callback handle disappear.
    if (
      index === 0 &&
      ts.isCallExpression(fn.parent) &&
      fn.parent.arguments[1] === fn &&
      canonical(fn.parent.expression)
    )
      return true;
    if (parameterValue(parameter, [], new Set()) === 'tenant-context') return true;
    return handleUnion(
      (calls.get(fn) ?? []).map(call => tenantHandle(call.arguments[index], seen, budget))
    );
  }
  function argumentValue(argument, keys, seen, use = argument) {
    argument = unwrap(argument);
    if (!argument || !work.enter() || mutations.has(model.symbol(argument))) return UNKNOWN;
    if (!keys.length) return provenance(argument, seen, use);
    if (seen.has(argument) || seen.size > 64) return UNKNOWN;
    seen = new Set(seen).add(argument);
    if (ts.isObjectLiteralExpression(argument)) {
      if (argument.properties.some(ts.isSpreadAssignment)) return UNKNOWN;
      const property = argument.properties.find(
        item => item.name?.getText().replace(/^['"]|['"]$/gu, '') === keys[0]
      );
      if (property && ts.isPropertyAssignment(property))
        return argumentValue(property.initializer, keys.slice(1), seen, use);
      if (property && ts.isShorthandPropertyAssignment(property))
        return argumentValue(property.name, keys.slice(1), seen, use);
      return UNKNOWN;
    }
    const decl = model.declaration(argument);
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return argumentValue(decl.initializer, keys, seen, use);
    if (decl && ts.isParameter(decl)) return parameterValue(decl, keys, seen);
    return UNKNOWN;
  }
  function parameterValue(parameter, keys, seen) {
    if (!work.enter()) return UNKNOWN;
    if (isMutated(parameter.name) || escapedFns.has(parameter.parent)) return UNKNOWN;
    if (parameter.initializer || parameter.dotDotDotToken || !isFunction(parameter.parent))
      return UNKNOWN;
    const fn = parameter.parent;
    const index = fn.parameters.indexOf(parameter);
    const parent = fn.parent;
    if (ts.isCallExpression(parent)) {
      if (canonical(parent.expression) && parent.arguments[1] === fn && index === 0 && !keys.length)
        return 'tenant-context';
      if (
        ts.isPropertyAccessExpression(parent.expression) &&
        parent.expression.name.text === 'transaction' &&
        parent.arguments[0] === fn &&
        index === 0 &&
        !keys.length
      ) {
        return provenance(parent.expression.expression, seen);
      }
    }
    const invocations = calls.get(fn) ?? [];
    if (!invocations.length) return UNKNOWN;
    let known;
    for (const call of invocations) {
      const value = argumentValue(call.arguments[index], keys, seen);
      // The join cannot recover from UNKNOWN or disagreement. No later caller can prove it.
      if (value === UNKNOWN || (known !== undefined && value !== known)) return UNKNOWN;
      known = value;
    }
    return known;
  }
  function lexicalLifetime(use, parameter, seen = new Set()) {
    if (!work.enter() || seen.has(use) || seen.size > 64) return false;
    seen = new Set(seen).add(use);
    const origin = parameter.parent;
    const owner = ownerOf(use);
    if (owner === origin) return true;
    if (!isFunction(owner)) return false;
    const parent = owner.parent;
    if (
      ts.isCallExpression(parent) &&
      ts.isPropertyAccessExpression(parent.expression) &&
      parent.expression.name.text === 'transaction'
    ) {
      return lexicalLifetime(parent, parameter, seen);
    }
    const invocations = calls.get(owner) ?? [];
    if (
      !invocations.length ||
      invocations.some(
        call =>
          call.getSourceFile() !== origin.getSourceFile() ||
          call.pos < origin.pos ||
          call.end > origin.end ||
          !lexicalLifetime(call, parameter, seen)
      )
    )
      return false;
    const name = owner.name ?? (ts.isVariableDeclaration(parent) ? parent.name : undefined);
    if (!name) return false;
    const symbol = model.symbol(name);
    let escaped = false;
    model.walk(origin, node => {
      if (!work.enter()) return;
      if (!ts.isIdentifier(node) || node === name || model.symbol(node) !== symbol) return;
      if (!(ts.isCallExpression(node.parent) && node.parent.expression === node)) escaped = true;
    });
    return !escaped;
  }
  function provenance(raw, seen = new Set(), use = raw) {
    const node = unwrap(raw);
    if (!node || !work.enter() || seen.has(node) || seen.size > 64) return UNKNOWN;
    seen = new Set(seen).add(node);
    if (ts.isPropertyAccessExpression(node)) {
      if (mutations.has(model.symbol(node.expression))) return UNKNOWN;
      const objectDecl = model.declaration(node.expression);
      if (objectDecl && ts.isParameter(objectDecl))
        return lexicalLifetime(use, objectDecl)
          ? parameterValue(objectDecl, [node.name.text], seen)
          : UNKNOWN;
      if (
        objectDecl &&
        ts.isVariableDeclaration(objectDecl) &&
        objectDecl.initializer &&
        ts.isObjectLiteralExpression(objectDecl.initializer)
      ) {
        return argumentValue(objectDecl.initializer, [node.name.text], seen, use);
      }
    }
    const symbol = model.symbol(node);
    if (mutations.has(symbol)) return UNKNOWN;
    const decl = model.declaration(node);
    if (!decl) return UNKNOWN;
    if (model.fileOf(decl) === DB_FILE && ['db', 'dbRls', 'dbAdmin'].includes(decl.name?.text))
      return decl.name.text;
    if (ts.isVariableDeclaration(decl) && decl.initializer)
      return provenance(decl.initializer, seen, use);
    if (ts.isParameter(decl))
      return lexicalLifetime(use, decl) ? parameterValue(decl, [], seen) : UNKNOWN;
    if (ts.isBindingElement(decl) && ts.isObjectBindingPattern(decl.parent)) {
      const parameter = decl.parent.parent;
      const key = decl.propertyName?.text ?? decl.name?.text;
      if (decl.initializer || !key) return UNKNOWN;
      if (ts.isVariableDeclaration(parameter) && parameter.initializer)
        return argumentValue(parameter.initializer, [key], seen, use);
      if (!ts.isParameter(parameter)) return UNKNOWN;
      return lexicalLifetime(use, parameter) ? parameterValue(parameter, [key], seen) : UNKNOWN;
    }
    return UNKNOWN;
  }
  const legacy = {
    provenance: (...args) => work.run(() => provenance(...args)),
    canonical,
    clientIdentity,
    tenantHandle: (...args) => work.run(() => tenantHandle(...args)),
    calls,
    mutations,
    unsafeMutations,
    escapedFns,
    isMutated,
    environmentChanges,
    analysisUnknown,
  };
  legacy.queryBoundary = expression => canonicalQueryChain(expression, legacy);
  const dispatch = createDispatch(model, legacy);
  const contextual = createContextualProvenance(model, legacy, dispatch, work);
  const result = contextual.facade(undefined);
  finish(result);
  return withInvocationEvidence(result, model);
}
