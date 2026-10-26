import ts from 'typescript';
import { externalValue } from './db-access-external.mjs';
import { dispatchCoverage } from './db-access-coverage.mjs';
import { canonicalQueryChain } from './db-access-inventory.mjs';
import { createSourceLookups } from './db-access-mutation-source-lookups.mjs';
import { compareCodeUnits } from './db-access-order.mjs';
import { isFunction, unwrap } from './db-access-source.mjs';

function directReference(node) {
  let parent = node.parent;
  while (parent && unwrap(parent) === node) parent = parent.parent;
  return parent && ts.isCallExpression(parent) && unwrap(parent.expression) === node;
}

export function collectMutationEffects(model) {
  const calls = new Map();
  const opaqueCalls = [];
  // Ordered syntax only, owned by this collection; all propagation answers remain live.
  const propagationSyntax = [];
  const mutations = new Set();
  const unsafeMutations = new Set(); // Explicit writes or changed opaque calls; never historical schema precision.
  const escapedFns = new Set();
  const environmentChanges = new Set();
  const analysisUnknown = new Set();
  // Immutable per-collection lookups keyed by AST node identity. Mutation membership stays live below.
  const { sourceSymbol, sourceFile, sourceDeclaration, sourceQueryOperator, changed, rootSymbol } =
    createSourceLookups(model);
  // Completed invalidations per AST node: 1 = non-strict, 2 = strict (subsumes non-strict).
  // A node is marked only after its entire traversal returned, so a thrown traversal is retried.
  const completedInvalidations = new WeakMap();
  const externalOrigins = new WeakMap();
  function globalRoot(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node || seen.has(node) || seen.size > 64) return false;
    seen = new Set(seen).add(node);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return globalRoot(node.expression, seen);
    const decl = sourceDeclaration(node);
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return globalRoot(decl.initializer, seen);
    return (
      ts.isIdentifier(node) &&
      ['process', 'globalThis', 'window', 'global'].includes(node.text) &&
      !decl
    );
  }
  function invalidate(raw, strict = false) {
    const node = unwrap(raw);
    if (!node) return;
    const tier = strict ? 2 : 1;
    if ((completedInvalidations.get(node) ?? 0) >= tier) return;
    if (globalRoot(node) && changed(node)) environmentChanges.add(sourceFile(node));
    if (ts.isArrayLiteralExpression(node)) node.elements.forEach(item => invalidate(item, strict));
    else if (ts.isObjectLiteralExpression(node)) {
      for (const item of node.properties) {
        if (ts.isPropertyAssignment(item)) invalidate(item.initializer, strict);
        else if (ts.isShorthandPropertyAssignment(item)) invalidate(item.name, strict);
        else if (ts.isSpreadAssignment(item)) invalidate(item.expression, strict);
      }
    } else if (ts.isSpreadElement(node)) invalidate(node.expression, strict);
    else if (ts.isBinaryExpression(node)) invalidate(node.left, strict);
    else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      invalidate(node.expression, strict);
    else {
      const symbol = sourceSymbol(node);
      if (symbol?.declarations?.length) {
        mutations.add(symbol);
        if (strict) unsafeMutations.add(symbol);
      }
    }
    completedInvalidations.set(node, tier);
  }
  function isMutated(raw) {
    const node = unwrap(raw);
    if (!node) return false;
    return mutations.has(rootSymbol(node));
  }
  function externalOrigin(raw) {
    const node = unwrap(raw);
    if (!node) return undefined;
    if (externalOrigins.has(node)) return externalOrigins.get(node);
    const result = traceExternalOrigin(node);
    externalOrigins.set(node, result);
    return result;
  }
  function traceExternalOrigin(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node || seen.has(node) || seen.size > 64) return undefined;
    seen = new Set(seen).add(node);
    const external = model.externalName(node);
    if (external) return external;
    if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node))
      return traceExternalOrigin(node.expression, seen);
    const decl = sourceDeclaration(node);
    return decl && ts.isVariableDeclaration(decl) && decl.initializer
      ? traceExternalOrigin(decl.initializer, seen)
      : undefined;
  }
  for (const sf of model.parsed.values())
    model.walk(sf, node => {
      if (
        (ts.isVariableDeclaration(node) && node.initializer) ||
        (ts.isParameter(node) && isFunction(node.parent))
      )
        propagationSyntax.push(node);
      if (ts.isCallExpression(node)) {
        const decl = sourceDeclaration(unwrap(node.expression));
        if (decl && isFunction(decl)) {
          const list = calls.get(decl) ?? [];
          list.push(node);
          calls.set(decl, list);
        } else opaqueCalls.push(node);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      )
        invalidate(node.left, true);
      if (
        (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
        !ts.isVariableDeclarationList(node.initializer)
      )
        invalidate(node.initializer, true);
      if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
      )
        invalidate(node.operand, true);
      if (!ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node)) return;
      const decl = sourceDeclaration(node);
      if (!decl || !isFunction(decl) || node === decl.name) return;
      let ancestor = node.parent;
      while (ancestor && !ts.isSourceFile(ancestor)) {
        if (
          ts.isImportDeclaration(ancestor) ||
          ts.isExportDeclaration(ancestor) ||
          ts.isTypeNode(ancestor)
        )
          return;
        ancestor = ancestor.parent;
      }
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) return;
      if (ts.isVariableDeclaration(node.parent) && node.parent.name === node) return;
      if (!directReference(node)) escapedFns.add(decl);
    });
  // A mutated parameter invalidates the argument of every syntax caller first, then every
  // resolved method/factory/closure caller of the current dispatch state, in their list order.
  function propagateMutatedParameter(node, state) {
    let mutated = false,
      strict = false;
    model.walk(node.name, part => {
      if (isMutated(part)) mutated = true;
      if (unsafeMutations.has(sourceSymbol(part))) strict = true;
    });
    if (!mutated) return;
    for (const call of calls.get(node.parent) ?? [])
      invalidate(call.arguments[node.parent.parameters.indexOf(node)], strict || changed(call));
    for (const call of state?.callers.get(node.parent) ?? []) {
      const argument = call.argumentBindings.get(node);
      const origins = state.effects.origins(argument, call.callerContext);
      for (const item of origins.values) invalidate(item.node, strict || changed(call.callNode));
      invalidate(argument, strict || changed(call.callNode));
    }
  }
  function finish(provenance) {
    let previous;
    // Scheduling evidence is local to this invocation and never memoizes origin, resolver or
    // mutation answers. mutations only receives additions during this synchronous
    // collectMutationEffects lifetime, so its size identifies a generation for this invocation
    // only. unsafeMutations is separate monotone strictness consumed by propagation; it is not an
    // input to dispatch construction or to opaque-call reads.
    let dispatchGeneration, completedSweep;
    for (let round = 0; round < 32; round++) {
      if (dispatchGeneration !== mutations.size) {
        // Rebuild on the first round and after every mutations addition. A new dispatch snapshot
        // discards completed opaque-sweep evidence.
        completedSweep = undefined;
        dispatchGeneration = mutations.size;
        provenance.dispatch?.reset();
      }
      const state = provenance.dispatch?.state();
      // Construction adds no mutations; if that ever changed, the next round rebuilds.
      if (dispatchGeneration !== mutations.size) dispatchGeneration = undefined;
      for (const reason of state?.reasons ?? []) analysisUnknown.add(reason);
      const beforeMutations = `${mutations.size}:${unsafeMutations.size}`;
      const signature = JSON.stringify([
        mutations.size,
        unsafeMutations.size,
        state?.escaped.size,
        [...(state?.callers ?? [])].map(([fn, list]) => [sourceFile(fn), fn.pos, list.length]),
        [...analysisUnknown].sort(compareCodeUnits),
      ]);
      if (signature === previous) return;
      previous = signature;
      // A completed sweep is reused only for the same generation and the same retained dispatch
      // snapshot: every read it made would repeat and every invalidation it made is idempotent.
      const reuseSweep =
        completedSweep !== undefined &&
        completedSweep.state === state &&
        completedSweep.generation === mutations.size &&
        dispatchGeneration === mutations.size;
      if (!reuseSweep) {
        // An interrupted sweep, or one that adds mutations, never becomes completed evidence.
        completedSweep = undefined;
        const sweepGeneration = mutations.size;
        for (const node of opaqueCalls) {
          const external = externalOrigin(node.expression);
          const declarative =
            (!changed(node) && externalValue(model, node.expression, { isMutated })) ||
            (external &&
              !changed(node) &&
              ['drizzle-orm', 'drizzle-orm/pg-core'].includes(external.module) &&
              [
                'pgEnum',
                'pgTable',
                'relations',
                'index',
                'uniqueIndex',
                'check',
                'foreignKey',
                'primaryKey',
                'unique',
                'eq',
                'and',
                'or',
                'asc',
                'desc',
                'ilike',
                'inArray',
                'isNull',
                'sql',
              ].includes(external.name));
          if (
            !declarative &&
            !(sourceQueryOperator(node.expression) && !isMutated(node.expression)) &&
            !canonicalQueryChain(node.expression, provenance) &&
            !dispatchCoverage(provenance, node).covered
          )
            for (const argument of node.arguments) {
              // Actual closure/parameter origins share the invocation registry used by dispatch.
              for (const variant of state?.byCall.get(node) ?? []) {
                const origins = state.effects.origins(argument, variant.context);
                for (const item of origins.values) {
                  const declaration = sourceDeclaration(item.node);
                  if (
                    (!declaration || !isFunction(declaration)) &&
                    (changed(node) || !declaration || sourceFile(declaration) === sourceFile(node))
                  )
                    invalidate(item.node, changed(node));
                }
              }
              const target = sourceDeclaration(unwrap(argument));
              if (target && isFunction(target)) continue; // Passing a function escapes its invocation provenance, not its binding.
              if (changed(node) || !target || sourceFile(target) === sourceFile(node))
                invalidate(argument, changed(node));
            }
        }
        if (sweepGeneration === mutations.size && dispatchGeneration === sweepGeneration)
          completedSweep = { state, generation: sweepGeneration };
      }
      // Every indexed initializer/caller is revisited each round, including rounds that
      // reuse the sweep, so strict-only unsafeMutations growth reaches every syntax and resolved
      // method/factory/closure caller.
      for (const node of propagationSyntax) {
        if (ts.isVariableDeclaration(node) && node.initializer && isMutated(node.name))
          invalidate(node.initializer, unsafeMutations.has(sourceSymbol(node.name)));
        if (ts.isParameter(node) && isFunction(node.parent)) propagateMutatedParameter(node, state);
      }
      if (beforeMutations === `${mutations.size}:${unsafeMutations.size}`) return;
    }
    analysisUnknown.add('mutation-dispatch-settlement-bound');
  }
  return {
    analysisUnknown,
    calls,
    mutations,
    unsafeMutations,
    escapedFns,
    isMutated,
    environmentChanges,
    finish,
  };
}
