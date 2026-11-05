// Tenant guard stage (L): a tenant transaction capability must not outlive its callback.
//
// Sources are the callbacks of every transaction opening outside the authenticated kernel: a
// kernel transaction entry (its callback is the last argument) and `.transaction(callback)` on
// any receiver, nested savepoints included, each with its own borrow boundary. The callback's
// first parameter is borrowed; rules-lifetime-flow.mjs decides whether any use lets it escape.
// Unchanged, legacy and contracted code is checked as well: no admission bypasses L.

import ts from 'typescript';
import { KERNEL } from './manifest.mjs';
import { byCodeUnit } from './rules-digest.mjs';
import { createLifetimeFlow } from './rules-lifetime-flow.mjs';
import { isFunctionLike } from './syntax.mjs';

const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const RULE = 'L1';
const ENTRY_NAMES = new Set(['withTenantAuthority', 'withTenantContext', 'withTenantDb']);

/** Installs the transaction-lifetime analysis as `ctx.checkLifetime()`. */
export function installLifetime(ctx) {
  const { TRANSACTION_ENTRIES, allIn, factsOf, identifierOrigins, isTest, sources, unwrap } = ctx;
  const flow = createLifetimeFlow(ctx);

  /** The callback a call opens a transaction with, `undefined` when it opens none. */
  function openedCallback(fact, call) {
    const callee = unwrap(call.expression);
    if (ts.isIdentifier(callee) && allIn(identifierOrigins(fact, callee), TRANSACTION_ENTRIES))
      return call.arguments.at(-1) ?? null;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'transaction')
      return call.arguments[0] ?? null;
    // A kernel entry read through a namespace import opens one too.
    if (namespaceEntry(fact, callee)) return call.arguments.at(-1) ?? null;
    return undefined;
  }

  /** `ns.withTenantAuthority` on a namespace import (`import * as ns`). */
  function namespaceEntry(fact, node) {
    if (!ts.isPropertyAccessExpression(node) || !ENTRY_NAMES.has(node.name.text)) return false;
    const root = unwrap(node.expression);
    const binding = ts.isIdentifier(root) ? ctx.referenceAt(fact, root)?.binding : null;
    return binding?.kind === 'import' && binding.imported === '*';
  }

  /** A kernel entry read other than as the callee of a call (`.call`, aliases, hand-offs). */
  function entryValue(fact, node) {
    const named = ts.isIdentifier(node)
      ? allIn(identifierOrigins(fact, node), TRANSACTION_ENTRIES)
      : namespaceEntry(fact, node);
    if (!named || (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node))
      return false;
    if (ts.isExportSpecifier(node.parent) || ts.isImportSpecifier(node.parent)) return false;
    const value = ctx.outermost(node);
    return !(ts.isCallExpression(value.parent) && value.parent.expression === value);
  }

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
        if (ts.isTypeNode(node)) return;
        if (entryValue(fact, node)) report(node, 'a transaction entry used as a value');
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
