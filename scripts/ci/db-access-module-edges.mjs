import ts from 'typescript';

// True when the authenticated app compiler epoch (verbatimModuleSyntax=false) erases this edge:
// declaration-level type-only syntax, or a nonempty all-type named list with no default binding.
// Empty lists, default/namespace imports, mixed lists, side-effect imports and export-star remain
// runtime edges. runtimeFingerprint stays conservative and deliberately does not use this.
export function isErasedTypeEdge(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false; // side-effect import
    if (clause.isTypeOnly) return true;
    const bindings = clause.namedBindings;
    return Boolean(
      !clause.name &&
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every(item => item.isTypeOnly)
    );
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    return Boolean(
      clause &&
      ts.isNamedExports(clause) &&
      clause.elements.length > 0 &&
      clause.elements.every(item => item.isTypeOnly)
    );
  }
  return false;
}
