// Tenant guard stage (L): a tenant transaction capability must not outlive its callback.
//
// Sources are the callbacks of every transaction opening outside the authenticated kernel: a
// kernel transaction entry (its callback is the last argument) and `.transaction(callback)` on
// any receiver, nested savepoints included, each with its own borrow boundary. An opener read
// without being called in place is followed by rules-lifetime-openers.mjs. The callback's
// first parameter is borrowed; rules-lifetime-flow.mjs decides whether any use lets it escape.
// Unchanged, legacy and contracted code is checked as well: no admission bypasses L.

import ts from 'typescript';
import { KERNEL } from './manifest.mjs';
import { originKey } from './modules.mjs';
import { byCodeUnit } from './rules-digest.mjs';
import { createLifetimeFlow } from './rules-lifetime-flow.mjs';
import { createLoaderChecks } from './rules-lifetime-loaders.mjs';
import { createOpenerChecks } from './rules-lifetime-openers.mjs';
import { createRunnerChecks } from './rules-lifetime-runners.mjs';
import { isFunctionLike, memberUse } from './syntax.mjs';

const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const RULE = 'L1';
// A transaction entry takes (context, callback): any other arity could hide the callback.
const ENTRY_ARITY = 2;

/** Installs the transaction-lifetime analysis as `ctx.checkLifetime()`. */
export function installLifetime(ctx) {
  const { TRANSACTION_ENTRIES, allIn, factsOf, graph, identifierOrigins, isTest, sources } = ctx;
  const { originsOf, referenceAt, unwrap } = ctx;
  const runners = createRunnerChecks(ctx, ctx.lifetimeRunners);
  ctx.lifetimeRunnerChecks = runners;
  const flow = createLifetimeFlow(ctx);
  const { openerProblem } = createOpenerChecks(ctx, flow);

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
    if (transactionMember(callee)) return { callback: call.arguments[0] ?? null };
    return runners.runnerCallback(fact, call);
  }

  /** A `.transaction` / `['transaction']` member read. */
  const transactionMember = node =>
    (ts.isPropertyAccessExpression(node) && node.name.text === 'transaction') ||
    (ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'transaction');

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
      const origins = exportOrigins(queue.shift());
      reaches = origins.some(origin => TRANSACTION_ENTRIES.has(originKey(origin)));
      for (const inner of origins.flatMap(origin => origin.namespace ?? [])) {
        if (seen.has(inner)) continue;
        seen.add(inner);
        queue.push(inner);
      }
    }
    entryModules.set(file, reaches);
    return reaches;
  }
  /** The origins of every name `file` exports. */
  const exportOrigins = file =>
    [...graph.exportNames(file)].flatMap(name => graph.resolveExport(file, name));
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

  /** `{ targets }`, the functions a transaction callback argument may be, or `{ problem }`. */
  function callbackTargets(fact, callback) {
    if (callback === null) return { problem: null, targets: [] };
    if (ts.isSpreadElement(callback))
      return { problem: 'a spread transaction callback', targets: [] };
    const value = unwrap(callback);
    if (isFunctionLike(value)) return { problem: null, targets: [{ fact, fn: value }] };
    return flow.stableTargets(fact, value);
  }

  /** Every lifetime problem at `node` itself, in report order. */
  function nodeProblems(fact, node) {
    const identifier = ts.isIdentifier(node);
    const call = ts.isCallExpression(node);
    const dynamicImport = call && loadsEntryModule(fact, node);
    return [
      identifier ? entryProblem(fact, node) : null,
      loaderProblem(fact, node),
      openerProblem(fact, node),
      identifier ? runners.referenceProblem(fact, node) : null,
      dynamicImport ? 'a dynamic import of a module exporting a transaction entry' : null,
      ...(call ? openedProblems(fact, node) : []),
    ].filter(Boolean);
  }

  /** A call that opens a transaction: each function its callback may be borrows it at 0. */
  function openedProblems(fact, call) {
    const opened = openedCallback(fact, call);
    if (opened === undefined) return [];
    ctx.telemetry.lifetimeSources = (ctx.telemetry.lifetimeSources ?? 0) + 1;
    if (opened.problem) return [opened.problem];
    const { problem, targets } = callbackTargets(fact, opened.callback);
    if (problem) return [problem];
    return targets.map(target => flow.paramProblem(target.fact, target.fn, 0));
  }

  function checkFile(file, fact) {
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
      for (const detail of nodeProblems(fact, node)) report(node, detail);
      ts.forEachChild(node, visit);
    });
  }

  function checkLifetime() {
    for (const file of [...sources.keys()].sort(byCodeUnit)) {
      if (isTest(file) || DECLARATION_FILE.test(file) || KERNEL.test(file)) continue;
      const fact = factsOf(file);
      if (fact) checkFile(file, fact);
    }
  }

  Object.assign(ctx, { checkLifetime });
}
