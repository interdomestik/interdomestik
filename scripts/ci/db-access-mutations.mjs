import ts from 'typescript';
import { externalValue } from './db-access-external.mjs';
import { canonicalQueryChain } from './db-access-inventory.mjs';
import { isFunction, unwrap, runtimeFingerprint } from './db-access-source.mjs';

export function collectMutationEffects(model) {
  const calls = new Map();
  const opaqueCalls = [];
  const mutations = new Set();
  const unsafeMutations = new Set(); // Explicit writes or changed opaque calls; never historical schema precision.
  const escapedFns = new Set();
  const environmentChanges = new Set();
  function globalRoot(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node || seen.has(node) || seen.size > 64) return false;
    seen = new Set(seen).add(node);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return globalRoot(node.expression, seen);
    const decl = model.declaration(node);
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return globalRoot(decl.initializer, seen);
    return (
      ts.isIdentifier(node) &&
      ['process', 'globalThis', 'window', 'global'].includes(node.text) &&
      !decl
    );
  }
  function changed(node) {
    const file = model.fileOf(node),
      before = model.approvedSources.get(file),
      after = model.sources.get(file);
    return (
      before === undefined ||
      (before !== after && runtimeFingerprint(before) !== runtimeFingerprint(after))
    );
  }
  function invalidate(raw, strict = false) {
    const node = unwrap(raw);
    if (!node) return;
    if (globalRoot(node) && changed(node)) environmentChanges.add(model.fileOf(node));
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
      const symbol = model.symbol(node);
      if (symbol?.declarations?.length) {
        mutations.add(symbol);
        if (strict) unsafeMutations.add(symbol);
      }
    }
  }
  function isMutated(raw) {
    let node = unwrap(raw);
    while (node && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)))
      node = unwrap(node.expression);
    return !!node && mutations.has(model.symbol(node));
  }
  function externalOrigin(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node || seen.has(node) || seen.size > 64) return undefined;
    seen = new Set(seen).add(node);
    const external = model.externalName(node);
    if (external) return external;
    if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node))
      return externalOrigin(node.expression, seen);
    const decl = model.declaration(node);
    return decl && ts.isVariableDeclaration(decl) && decl.initializer
      ? externalOrigin(decl.initializer, seen)
      : undefined;
  }
  function directReference(node) {
    let parent = node.parent;
    while (parent && unwrap(parent) === node) parent = parent.parent;
    return parent && ts.isCallExpression(parent) && unwrap(parent.expression) === node;
  }
  for (const sf of model.parsed.values())
    model.walk(sf, node => {
      if (ts.isCallExpression(node)) {
        const decl = model.declaration(unwrap(node.expression));
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
      const decl = model.declaration(node);
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
  function finish(provenance) {
    let previous = -1;
    while (previous !== mutations.size + unsafeMutations.size) {
      previous = mutations.size + unsafeMutations.size;
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
          !(model.isQueryOperator(node.expression) && !isMutated(node.expression)) &&
          !canonicalQueryChain(node.expression, provenance)
        )
          for (const argument of node.arguments) {
            const target = model.declaration(unwrap(argument));
            if (target && isFunction(target)) continue; // Passing a function escapes its invocation provenance, not its binding.
            if (changed(node) || !target || model.fileOf(target) === model.fileOf(node))
              invalidate(argument, changed(node));
          }
      }
      for (const sf of model.parsed.values())
        model.walk(sf, node => {
          if (ts.isVariableDeclaration(node) && node.initializer && isMutated(node.name))
            invalidate(node.initializer, unsafeMutations.has(model.symbol(node.name)));
          if (ts.isParameter(node) && isFunction(node.parent)) {
            let mutated = false,
              strict = false;
            model.walk(node.name, part => {
              if (isMutated(part)) mutated = true;
              if (unsafeMutations.has(model.symbol(part))) strict = true;
            });
            if (mutated)
              for (const call of calls.get(node.parent) ?? [])
                invalidate(
                  call.arguments[node.parent.parameters.indexOf(node)],
                  strict || changed(call)
                );
          }
        });
    }
  }
  return { calls, mutations, unsafeMutations, escapedFns, isMutated, environmentChanges, finish };
}
