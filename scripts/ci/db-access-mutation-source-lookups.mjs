import ts from 'typescript';
import { runtimeFingerprint, unwrap } from './db-access-source.mjs';

// Per-collection lookups over one fixed source model. Candidate and approved snapshots do not
// change during a collection, so every answer below is a pure function of AST node identity (never
// source text or file name). Answers, including undefined and false, are written only after the
// underlying read succeeds, so an exception is never cached. Mutation membership is deliberately
// absent: callers test their live mutations set against the cached root symbol. Nothing here is
// shared across models, collections or processes.
export function createSourceLookups(model) {
  const symbols = new WeakMap();
  const files = new WeakMap();
  const declarations = new WeakMap();
  const queryOperators = new WeakMap();
  const roots = new WeakMap();
  const changedNodes = new WeakMap();
  const changedByFile = new Map();
  function cached(store, node, read) {
    if (!store.has(node)) store.set(node, read(node));
    return store.get(node);
  }
  const sourceSymbol = node => cached(symbols, node, value => model.symbol(value));
  const sourceFile = node => cached(files, node, value => model.fileOf(value));
  const sourceDeclaration = node => cached(declarations, node, value => model.declaration(value));
  function sourceQueryOperator(node) {
    // Without a node there is no identity to key on: keep the model's own answer.
    if (!node) return model.isQueryOperator(node);
    return cached(queryOperators, node, value => model.isQueryOperator(value));
  }
  function readChanged(node) {
    const file = sourceFile(node);
    if (changedByFile.has(file)) return changedByFile.get(file);
    const before = model.approvedSources.get(file),
      after = model.sources.get(file);
    // Errors propagate before the cache write; they never become a cached false/unknown.
    const result =
      before === undefined ||
      (before !== after && runtimeFingerprint(before) !== runtimeFingerprint(after));
    changedByFile.set(file, result);
    return result;
  }
  const changed = node => cached(changedNodes, node, readChanged);
  // Symbol of the root identifier behind property/element access chains; undefined when absent.
  function rootSymbol(node) {
    return cached(roots, node, start => {
      let root = start;
      while (root && (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)))
        root = unwrap(root.expression);
      return root ? sourceSymbol(root) : undefined;
    });
  }
  return { sourceSymbol, sourceFile, sourceDeclaration, sourceQueryOperator, changed, rootSymbol };
}
