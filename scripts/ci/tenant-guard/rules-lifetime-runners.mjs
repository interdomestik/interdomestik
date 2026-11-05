// Tenant guard stage helper (L): reviewed transaction runners (see lifetime-runners.mjs).
//
// A reviewed runner is a module-private top-level function declaration that opens a transaction,
// or takes a borrowed one from its caller, and hands it to a callback parameter. It is active only
// while its whole file is byte-identical to the reviewed digest, the file does not export it, and
// every binding its declaration reads (directly or through same-file declarations) resolves to
// that file, to the kernel or to an external package (namespace imports by their modules), and it
// never reassigns a parameter. Being private, it can be named only inside
// its reviewed file. While active:
// - inside the runner, its callback parameter may receive the capability;
// - every call of the runner is a transaction source whose callback is checked like any other;
// - a `lends` parameter (an existing borrow the runner hands to its callback) may receive the
//   capability, and the call must then be joined like any lending helper;
// - the runner may only be named as the callee of a direct call with that exact arity.
// An inactive runner is ordinary code: its callback forwarding is refused as before.

import ts from 'typescript';
import { KERNEL } from './manifest.mjs';
import { sha256 } from './rules-digest.mjs';
import { writes } from './rules-lifetime-forms.mjs';

/** Builds the runner checks over `ctx` for the reviewed `runners` manifest. */
export function createRunnerChecks(ctx, runners) {
  const { factsOf, graph, originsOf, referenceAt, unwrap } = ctx;
  let active = null;

  /** Active runners by declaration node: { runner, fn }. Resolved once facts exist. */
  function activeRunners() {
    if (active) return active;
    active = new Map();
    for (const runner of runners) {
      const sourceFile = graph.sourceFileOf(runner.file);
      if (!sourceFile || sha256(sourceFile.text) !== runner.sha256) continue;
      const fact = factsOf(runner.file);
      const fn = fact?.declarations.get(runner.unit);
      if (!fn || !ts.isFunctionDeclaration(fn) || !fn.body) continue;
      if (exported(runner.file, runner.unit)) continue;
      if (fn.parameters.some(param => param.dotDotDotToken || !ts.isIdentifier(param.name)))
        continue;
      if (reassignsParameter(fn)) continue;
      if (!authenticated(fact, fn, runner.file)) continue;
      active.set(fn, { fact, fn, runner });
    }
    ctx.telemetry.lifetimeRunners = active.size;
    return active;
  }

  /** Whether any export of `file` (default and aliases included) resolves to its `unit`. */
  function exported(file, unit) {
    for (const name of graph.exportNames(file)) {
      for (const origin of graph.resolveExport(file, name))
        if (origin.file === file && origin.name === unit) return true;
    }
    return graph.resolveExport(file, 'default').some(o => o.file === file && o.name === unit);
  }

  /** Every binding read by `fn`, and by the same-file declarations it reaches, resolves inside
   * the reviewed file, to the kernel or to an external package. */
  function authenticated(fact, fn, file) {
    const queue = [fn];
    const seen = new Set(queue);
    let ok = true;
    const visit = node => {
      if (!ok) return;
      if (ts.isIdentifier(node)) {
        const reference = referenceAt(fact, node);
        const binding = reference?.binding;
        if (binding?.kind === 'import') {
          // A namespace value carries its modules, not origins; an unresolved origin is unknown.
          const { origins, namespace = [] } = originsOf(fact, reference);
          const files = [...origins.map(origin => origin.file), ...namespace];
          const foreign = target => target && target !== file && !KERNEL.test(target);
          if (origins.some(origin => origin.unresolved) || files.some(foreign)) ok = false;
        } else if (binding?.decl) {
          const statement = topLevel(binding.decl);
          if (statement && !seen.has(statement)) {
            seen.add(statement);
            queue.push(statement);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    while (queue.length > 0 && ok) visit(queue.shift());
    return ok;
  }

  /** Whether any parameter name of `fn` is written anywhere in it: a replaced callback (or lent
   * borrow) is no longer the value the call site handed over. */
  function reassignsParameter(fn) {
    const names = new Set(fn.parameters.map(param => param.name.text));
    let written = false;
    const visit = node => {
      if (written) return;
      if (ts.isIdentifier(node) && names.has(node.text) && writes(node, ctx)) written = true;
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
    return written;
  }

  /** The active runner declared by `fn`, or null. */
  const runnerOf = fn => activeRunners().get(fn) ?? null;

  /** The active runner a same-file identifier binds directly, or null. */
  function namedRunner(fact, node) {
    if (!ts.isIdentifier(node) || activeRunners().size === 0) return null;
    const binding = referenceAt(fact, node)?.binding;
    if (binding?.kind !== 'function' || binding.decl.getSourceFile() !== fact.sourceFile)
      return null;
    return runnerOf(binding.decl);
  }

  /** The callback a call to an active runner opens a transaction with, a problem, or undefined. */
  function runnerCallback(fact, call) {
    const entry = namedRunner(fact, unwrap(call.expression));
    if (!entry) return undefined;
    if (call.questionDotToken) return { problem: 'a reviewed runner called optionally' };
    if (
      call.arguments.length !== entry.fn.parameters.length ||
      call.arguments.some(ts.isSpreadElement)
    )
      return { problem: 'a reviewed runner called with another arity' };
    return { callback: call.arguments[entry.runner.callback] };
  }

  /** Whether parameter `index` of `fn` is a borrow the active runner lends to its callback. */
  const lends = (fn, index) => runnerOf(fn)?.runner.lends.includes(index) ?? false;

  /** Whether `binding` is the callback parameter of the active runner declaring it. */
  function isCallbackParam(binding, node) {
    const entry = binding?.kind === 'param' ? runnerOf(binding.decl) : null;
    return entry !== null && entry.fn.parameters[entry.runner.callback].name.text === node.text;
  }

  /** Why a reference to an active runner is not the callee of a direct call, or null. */
  function referenceProblem(fact, node) {
    if (ts.isFunctionDeclaration(node.parent) && node.parent.name === node) return null;
    if (!namedRunner(fact, node)) return null;
    const value = ctx.outermost(node);
    if (ts.isCallExpression(value.parent) && value.parent.expression === value) return null;
    return 'a reviewed runner used as a value';
  }

  return { isCallbackParam, lends, referenceProblem, runnerCallback };
}

function topLevel(node) {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) current = current.parent;
  return current.parent ? current : null;
}
