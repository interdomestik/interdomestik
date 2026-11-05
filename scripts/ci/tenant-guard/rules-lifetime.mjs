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
    return undefined;
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
