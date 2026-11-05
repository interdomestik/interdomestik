// Tenant guard stage (L): a tenant transaction capability must not outlive its callback.
//
// Sources are the callbacks of every transaction opening outside the authenticated kernel: a
// kernel transaction entry (its callback is the last argument) and `.transaction(callback)` on
// any receiver, nested savepoints included, each with its own borrow boundary. The callback's
// first parameter is borrowed; rules-lifetime-flow.mjs decides whether any use lets it escape.
// Unchanged, legacy and contracted code is checked as well: no admission bypasses L.

import ts from 'typescript';
import { KERNEL } from './manifest.mjs';
import { originKey } from './modules.mjs';
import { byCodeUnit } from './rules-digest.mjs';
import { createLifetimeFlow } from './rules-lifetime-flow.mjs';
import { createLoaderChecks } from './rules-lifetime-loaders.mjs';
import { isFunctionLike, memberUse } from './syntax.mjs';

const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const RULE = 'L1';
// A transaction entry takes (context, callback): any other arity could hide the callback.
const ENTRY_ARITY = 2;

/** Installs the transaction-lifetime analysis as `ctx.checkLifetime()`. */
export function installLifetime(ctx) {
  const { TRANSACTION_ENTRIES, allIn, factsOf, graph, identifierOrigins, isTest, sources } = ctx;
  const { originsOf, referenceAt, unwrap } = ctx;
  const flow = createLifetimeFlow(ctx);

  /** The callback a call opens a transaction with (`{ callback }`, or `{ problem }` when it cannot
   * be located), `undefined` when the call opens none. */
  function openedCallback(fact, call) {
    const callee = unwrap(call.expression);
    // A kernel entry, named directly or as a member of its module namespace (`ns.entry(...)`).
    const root = ts.isPropertyAccessExpression(callee) ? unwrap(callee.expression) : callee;
    if (ts.isIdentifier(root) && allIn(identifierOrigins(fact, root), TRANSACTION_ENTRIES)) {
      if (call.arguments.length !== ENTRY_ARITY || call.arguments.some(ts.isSpreadElement))
        return { problem: 'a transaction entry called other than as (context, callback)' };
      return { callback: call.arguments[1] };
    }
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'transaction')
      return { callback: call.arguments[0] ?? null };
    return undefined;
  }

  const entryModules = new Map();
  /** Whether `file` exports a transaction entry, directly or through a module object it exports
   * (`export * as inner from …`), at any depth. Each answer is a complete search of the module
   * objects reachable from `file`, so a re-export cycle never caches a partial result. */
  function entryModule(file) {
    if (entryModules.has(file)) return entryModules.get(file);
    const seen = new Set([file]);
    const queue = [file];
    let reaches = false;
    while (queue.length > 0 && !reaches) {
      const current = queue.shift();
      for (const name of graph.exportNames(current)) {
        for (const origin of graph.resolveExport(current, name)) {
          if (TRANSACTION_ENTRIES.has(originKey(origin))) reaches = true;
          for (const inner of origin.namespace ?? []) {
            if (seen.has(inner)) continue;
            seen.add(inner);
            queue.push(inner);
          }
        }
      }
    }
    entryModules.set(file, reaches);
    return reaches;
  }
  const { loaderProblem, loadsEntryModule } = createLoaderChecks(ctx, entryModule);

  /** Why a reference to a transaction entry, or to a module object exporting one, escapes the
   * one admitted form (the callee of a call, as `entry(...)` or `ns.entry(...)`), or null. */
  function entryProblem(fact, node) {
    const reference = referenceAt(fact, node);
    if (!reference?.binding) return null;
    if (ts.isImportSpecifier(node.parent) || ts.isExportSpecifier(node.parent)) return null;
    const resolved = originsOf(fact, reference);
    const modules = [
      ...(resolved.namespace ?? []),
      ...resolved.origins.flatMap(origin => origin.namespace ?? []),
    ];
    const namespace = modules.some(entryModule);
    // A module object is admitted only as `ns.member` naming a declaration: a member that is a
    // module object itself (`ns.inner`) would be one more unresolved namespace value.
    const member = namespace ? memberUse(node) : null;
    const memberObject = resolved.origins.some(origin =>
      (origin.namespace ?? []).some(entryModule)
    );
    if (namespace && (!member || reference.binding.imported !== '*' || memberObject))
      return 'a module object exporting a transaction entry used as a value';
    if (!allIn(resolved.origins.map(originKey), TRANSACTION_ENTRIES)) return null;
    const value = ctx.outermost(member ? member.node : node);
    if (ts.isCallExpression(value.parent) && value.parent.expression === value) return null;
    return 'a transaction entry used as a value';
  }

  /** Type positions erase at runtime, except a class `extends` expression. */
  const erased = node =>
    ts.isTypeNode(node) &&
    !(
      ts.isExpressionWithTypeArguments(node) &&
      ts.isHeritageClause(node.parent) &&
      node.parent.token === ts.SyntaxKind.ExtendsKeyword &&
      ts.isClassLike(node.parent.parent)
    );

  /** The functions a transaction callback argument may be, or why it cannot be checked. */
  function callbackTargets(fact, callback) {
    if (callback === null) return [];
    if (ts.isSpreadElement(callback)) return 'a spread transaction callback';
    const value = unwrap(callback);
    if (isFunctionLike(value)) return [{ fact, fn: value }];
    return flow.stableTargets(fact, value);
  }

  function checkLifetime() {
    for (const file of [...sources.keys()].sort(byCodeUnit)) {
      if (isTest(file) || DECLARATION_FILE.test(file) || KERNEL.test(file)) continue;
      const fact = factsOf(file);
      if (!fact) continue;
      const report = (node, detail) =>
        ctx.violate(
          file,
          node,
          fact.sourceFile,
          RULE,
          `a tenant transaction capability can outlive its callback: ${detail}`
        );
      ts.forEachChild(fact.sourceFile, function visit(node) {
        if (erased(node)) return;
        const entry = ts.isIdentifier(node) ? entryProblem(fact, node) : null;
        if (entry) report(node, entry);
        const loader = loaderProblem(fact, node);
        if (loader) report(node, loader);
        if (ts.isCallExpression(node) && loadsEntryModule(fact, node))
          report(node, 'a dynamic import of a module exporting a transaction entry');
        if (ts.isCallExpression(node)) {
          const opened = openedCallback(fact, node);
          if (opened !== undefined) {
            ctx.telemetry.lifetimeSources = (ctx.telemetry.lifetimeSources ?? 0) + 1;
            const targets = opened.problem ?? callbackTargets(fact, opened.callback);
            if (typeof targets === 'string') report(node, targets);
            else {
              for (const target of targets) {
                const problem = flow.paramProblem(target.fact, target.fn, 0);
                if (problem) report(node, problem);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      });
    }
  }

  Object.assign(ctx, { checkLifetime });
}
