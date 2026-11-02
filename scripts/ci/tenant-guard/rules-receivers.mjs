// Tenant guard stage: query receivers and cross-file references.

import ts from 'typescript';
import { originKey } from './modules.mjs';
import { createReceiverProblem } from './rules-receivers-problem.mjs';
import { forEachOrigin } from './rules-origins.mjs';

/** Installs the query-receiver analysis and reference lookup on `ctx`. */
export function installReceivers(ctx) {
  const { factsOf, isTest, originsOf, outermost, sources } = ctx;
  const receiverProblem = createReceiverProblem(ctx, declaredFunction);

  /** How callers reach `fn`: its top-level key, or its local binding declaration. */
  function declaredFunction(fact, fn) {
    for (const [name, unit] of fact.declarations) {
      if (unit === fn) return { key: `${fact.file}#${name}` };
    }
    if (ts.isFunctionDeclaration(fn) && fn.name) return { local: fn };
    const declaration = outermost(fn).parent;
    if (
      ts.isVariableDeclaration(declaration) &&
      ts.isIdentifier(declaration.name) &&
      (declaration.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      return { local: declaration };
    }
    return null;
  }

  let originIndex = null;
  function referencesTo(key) {
    if (!originIndex) {
      originIndex = new Map();
      const index = originIndex;
      forEachOrigin(
        { factsOf, isTest, originsOf, sources },
        () => false,
        ({ fact, reference, origin, form }) => {
          const originName = originKey(origin);
          if (!originName) return;
          if (!index.has(originName)) index.set(originName, []);
          index.get(originName).push({ fact, reference, form });
        }
      );
    }
    return originIndex.get(key) ?? [];
  }
  Object.assign(ctx, { declaredFunction, receiverProblem, referencesTo });
}
