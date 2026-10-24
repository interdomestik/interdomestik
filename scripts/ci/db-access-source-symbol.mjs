import ts from 'typescript';

// Lexical symbol and declaration lookups over one fixed checker. createSourceModel calls this once
// per model, so the WeakMap below is private to that model and is never shared across models,
// collections or processes.
//
// symbol() memoizes only completed answers of the original, uncached lexical resolution, keyed by
// exact AST node identity. An answer is stored only after resolveSymbol returns. This includes
// undefined and the defensive alias-cycle undefined. An exception, including one thrown midway
// through an alias traversal, is never cached, and the next call resolves cold. The stored value
// is the live checker Symbol object, never a copy. declaration() is deliberately uncached: it
// reuses symbol() and then reads valueDeclaration/declarations live on every call.
//
// This relies on the evaluator keeping its sources, parsed AST, Program and checker fixed for the
// model's lifetime. It is not a TypeScript memoization guarantee. It does not make any symbol or
// access safe.
export function createLexicalLookups(checker, isFunction, observer) {
  const symbols = new WeakMap();
  function resolveSymbol(node) {
    let result = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
    const seen = new Set();
    while (result && result.flags & ts.SymbolFlags.Alias) {
      if (seen.has(result)) return undefined;
      seen.add(result);
      result = checker.getAliasedSymbol(result);
    }
    return result;
  }
  function symbol(node) {
    // A non-object cannot key a WeakMap; it keeps the original uncached behavior, errors included.
    if (node === null || typeof node !== 'object') return resolveSymbol(node);
    if (symbols.has(node)) {
      const result = symbols.get(node);
      observer?.readSymbol(result);
      return result;
    }
    const result = resolveSymbol(node);
    symbols.set(node, result);
    observer?.readSymbol(result);
    return result;
  }
  function declaration(node) {
    if (isFunction(node)) return node;
    const resolved = symbol(node);
    const decl = resolved?.valueDeclaration ?? resolved?.declarations?.[0];
    if (decl && ts.isVariableDeclaration(decl)) {
      return decl.initializer && isFunction(decl.initializer) ? decl.initializer : decl;
    }
    return decl;
  }
  return { symbol, declaration };
}
