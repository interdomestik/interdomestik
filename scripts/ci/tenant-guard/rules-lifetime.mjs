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
import { isFunctionLike, memberUse } from './syntax.mjs';

const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const RULE = 'L1';
const LOADER_MODULES = new Set(['module', 'node:module']);
const LOADER_MEMBERS = new Set(['getBuiltinModule', 'mainModule', 'require']);

/** Installs the transaction-lifetime analysis as `ctx.checkLifetime()`. */
export function installLifetime(ctx) {
  const { TRANSACTION_ENTRIES, allIn, factsOf, graph, identifierOrigins, isTest, sources } = ctx;
  const { originsOf, referenceAt, unwrap } = ctx;
  const flow = createLifetimeFlow(ctx);

  /** The callback a call opens a transaction with, `undefined` when it opens none. */
  function openedCallback(fact, call) {
    const callee = unwrap(call.expression);
    // A kernel entry, named directly or as a member of its module namespace (`ns.entry(...)`).
    const root = ts.isPropertyAccessExpression(callee) ? unwrap(callee.expression) : callee;
    if (ts.isIdentifier(root) && allIn(identifierOrigins(fact, root), TRANSACTION_ENTRIES))
      return call.arguments.at(-1) ?? null;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'transaction')
      return call.arguments[0] ?? null;
    return undefined;
  }

  const entryModules = new Map();
  /** Whether `file` exports a transaction entry under any name. */
  function entryModule(file) {
    if (!entryModules.has(file)) {
      entryModules.set(
        file,
        [...graph.exportNames(file)].some(name =>
          graph.resolveExport(file, name).some(origin => TRANSACTION_ENTRIES.has(originKey(origin)))
        )
      );
    }
    return entryModules.get(file);
  }

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
    // A module object is admitted only as `ns.member`, resolved member by member.
    const member = namespace ? memberUse(node) : null;
    if (namespace && (!member || reference.binding.imported !== '*'))
      return 'a module object exporting a transaction entry used as a value';
    if (!allIn(resolved.origins.map(originKey), TRANSACTION_ENTRIES)) return null;
    const value = ctx.outermost(member ? member.node : node);
    if (ts.isCallExpression(value.parent) && value.parent.expression === value) return null;
    return 'a transaction entry used as a value';
  }

  const isRequire = (fact, node) =>
    ts.isIdentifier(node) &&
    node.text === 'require' &&
    referenceAt(fact, node) &&
    !referenceAt(fact, node).binding;

  /** Why `node` reaches a module loader other than a direct `import()` / `require()` call. */
  function loaderProblem(fact, node) {
    if (isRequire(fact, node)) {
      const value = ctx.outermost(node);
      if (!(ts.isCallExpression(value.parent) && value.parent.expression === value))
        return 'an indirect require';
    }
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : null;
    if (specifier && ts.isStringLiteralLike(specifier) && LOADER_MODULES.has(specifier.text))
      return 'an import of the module loader';
    if (
      ts.isPropertyAccessExpression(node) &&
      LOADER_MEMBERS.has(node.name.text) &&
      ts.isIdentifier(unwrap(node.expression)) &&
      ['globalThis', 'global', 'module', 'process'].includes(unwrap(node.expression).text) &&
      !referenceAt(fact, unwrap(node.expression))?.binding
    )
      return `a module loader member (${node.name.text})`;
    return null;
  }

  /** A dynamic `import()` / `require()` of a module exporting a transaction entry. */
  function loadsEntryModule(fact, call) {
    const callee = unwrap(call.expression);
    const loader = callee.kind === ts.SyntaxKind.ImportKeyword || isRequire(fact, callee);
    const [specifier] = call.arguments;
    if (!loader || !specifier || !ts.isStringLiteralLike(specifier)) return false;
    return graph.resolveSpecifier(fact.file, specifier.text).files.some(entryModule);
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
          const callback = openedCallback(fact, node);
          if (callback !== undefined) {
            ctx.telemetry.lifetimeSources = (ctx.telemetry.lifetimeSources ?? 0) + 1;
            const targets = callbackTargets(fact, callback);
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
