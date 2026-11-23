import ts from 'typescript';

export function callableDeclaration(decl: ts.Node) {
  const fn = ts.isVariableDeclaration(decl) ? decl.initializer : decl;
  return fn && (ts.isFunctionLike(fn) || ts.isFunctionTypeNode(fn)) ? fn : undefined;
}

export type Declaration = { file: string; decl: ts.Node };
export const sourceFile = /\.[cm]?[jt]sx?$/u;

export function keyOf({ file, decl }: Declaration): string {
  return `${file}:${decl.getStart()}`;
}

export function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  function visit(child: ts.Node) {
    found.push(child);
    child.forEachChild(visit);
  }
  visit(node);
  return found;
}

export function isValueUse(node: ts.Identifier) {
  const { parent } = node;
  return (
    !ts.isImportSpecifier(parent) &&
    !ts.isNamespaceImport(parent) &&
    !ts.isImportClause(parent) &&
    !ts.isImportEqualsDeclaration(parent) &&
    !ts.isExportSpecifier(parent) &&
    !ts.isNamespaceExport(parent) &&
    !ts.isPartOfTypeNode(node) &&
    !ts.findAncestor(node, ts.isTypeQueryNode) &&
    !(ts.isPropertyAccessExpression(parent) && parent.name === node) &&
    !(ts.isPropertyAssignment(parent) && parent.name === node) &&
    !(
      (ts.isVariableDeclaration(parent) ||
        ts.isBindingElement(parent) ||
        ts.isParameter(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isFunctionExpression(parent) ||
        ts.isClassDeclaration(parent)) &&
      parent.name === node
    )
  );
}

export function hasName(node: ts.Node | undefined, name: string) {
  return node !== undefined && ts.isIdentifier(node) && node.text === name;
}

export function previousStatements(node: ts.Node) {
  const result: ts.Statement[] = [];
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (!ts.isBlock(parent)) continue;
    const index = parent.statements.indexOf(current as ts.Statement);
    if (index >= 0) result.push(...parent.statements.slice(0, index).reverse());
  }
  return result;
}

export function constDeclaration(decl: ts.Node | undefined) {
  if (
    decl &&
    ts.isVariableDeclaration(decl) &&
    ts.isVariableDeclarationList(decl.parent) &&
    decl.parent.flags & ts.NodeFlags.Const
  )
    return decl;
}

export function localBinding(symbol: ts.Symbol | undefined, at: ts.Identifier) {
  const value = symbol?.valueDeclaration;
  const binding = value && ts.isBindingElement(value) ? value : undefined;
  const decl = constDeclaration(binding ? binding.parent.parent : value);
  if (!decl || !previousStatements(at).includes(decl.parent.parent as ts.Statement)) return;
  if (!binding || ts.isObjectBindingPattern(binding.parent)) return { decl, binding };
}

export function walkReferences(
  inventory: { references(ref: Declaration): Declaration[] },
  unit: Declaration,
  stop: (ref: Declaration) => boolean
) {
  const seen = new Map<string, Declaration>();
  const queue = [unit];
  for (const ref of queue) {
    const key = keyOf(ref);
    if (seen.has(key)) continue;
    seen.set(key, ref);
    if (stop(ref)) continue;
    queue.push(...inventory.references(ref));
  }
  return [...seen.values()];
}
