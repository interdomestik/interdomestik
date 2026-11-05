// Tenant guard stage helper (L): the functions a call lending a borrowed capability may invoke.
//
// A callee is followed only to the function its name directly declares: an inline function, a
// function declaration that nothing rebinds (no assignment, `for…of` target or hoisted redeclaration),
// or a const bound directly to a function value, locally or through an import. A callee read from
// a parameter (a higher-order runner such as `action(tx)` or `args.persistEffects(tx)`) is refused:
// its callers cannot be shown to bind it to a reviewed function that is never replaced. Aliases,
// wrappers (`cache(fn)`), globals, members and computed callees are refused as well.

import ts from 'typescript';
import { hasFlag } from './rules-digest.mjs';
import { hoistedDeclarations, writes } from './rules-lifetime-forms.mjs';
import { isFunctionLike } from './syntax.mjs';

/** Builds `stableTargets(fact, callee)`: [{ fact, fn }] or why the callee cannot be followed. */
export function createLifetimeCallees(ctx, { bindingOf, usesOf }) {
  const { factsOf, originsOf, referenceAt, unwrap } = ctx;
  const text = (fact, node) => node.getText(fact.sourceFile).slice(0, 40);

  function stableTargets(fact, callee) {
    const node = unwrap(callee);
    if (isFunctionLike(node)) return [{ fact, fn: node }];
    if (!ts.isIdentifier(node)) return `a callee that is not a declared name (${text(fact, node)})`;
    const reference = referenceAt(fact, node);
    const binding = reference?.binding;
    if (!binding) return `a global callee (${text(fact, node)})`;
    // A reviewed runner's callback parameter is checked at each call of the runner instead.
    if (binding.kind === 'param' && ctx.lifetimeRunnerChecks?.isCallbackParam(binding, node))
      return [];
    if (binding.kind === 'param') return `a callback read from a parameter (${node.text})`;
    const target =
      binding.kind === 'import'
        ? importedDeclaration(fact, reference)
        : localDeclaration(fact, binding.decl);
    return target ? [target] : `a callee that is not a stable function declaration (${node.text})`;
  }

  function importedDeclaration(fact, reference) {
    const { origins } = originsOf(fact, reference);
    const [origin] = origins;
    if (origins.length !== 1 || !origin.file) return null;
    const owner = factsOf(origin.file);
    const statement = owner?.statements.get(origin.name);
    if (!statement) return null;
    if (ts.isFunctionDeclaration(statement)) return localDeclaration(owner, statement);
    if (!ts.isVariableStatement(statement)) return null;
    const declaration = statement.declarationList.declarations.find(
      item => ts.isIdentifier(item.name) && item.name.text === origin.name
    );
    return declaration ? localDeclaration(owner, declaration) : null;
  }

  /** The function `declaration` binds directly and stably, or null. */
  function localDeclaration(fact, declaration) {
    if (ts.isFunctionDeclaration(declaration) && declaration.name && declaration.body) {
      const scope = hoistingScope(declaration);
      if (hoistedDeclarations(scope, declaration.name.text) !== 1) return null;
      const binding = bindingOf(fact, declaration.name);
      if (binding && usesOf(fact, binding).some(use => writes(use.node, ctx))) return null;
      return { fact, fn: declaration };
    }
    if (
      !ts.isVariableDeclaration(declaration) ||
      !ts.isIdentifier(declaration.name) ||
      !hasFlag(declaration.parent, ts.NodeFlags.Const) ||
      !declaration.initializer
    )
      return null;
    const value = unwrap(declaration.initializer);
    return isFunctionLike(value) ? { fact, fn: value } : null;
  }

  return { stableTargets };
}

/** The function or file whose `var` and function declarations share a name with `declaration`. */
function hoistingScope(declaration) {
  for (let node = declaration.parent; node; node = node.parent)
    if (ts.isSourceFile(node) || isFunctionLike(node)) return node;
  return declaration.getSourceFile();
}
