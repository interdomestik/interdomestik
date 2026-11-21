// Top-level declarations of a file for the consent-control-registered rule (CHK-22): its exports
// and the names of the components that hold its boundaries.

// The name a declaration gives, used to name the component that holds a boundary.
function declaredName(node) {
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id)
    return node.id.name;
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') return node.id.name;
  if (node.type === 'ExportDefaultDeclaration') return node.declaration.id?.name ?? 'default';
  return null;
}

// The outermost declaration around `node`: the file's component that holds it, or '?'.
function componentOf(node) {
  let name = '?';
  for (let current = node.parent; current; current = current.parent)
    name = declaredName(current) ?? name;
  return name;
}

// [name, node] of each top-level declaration of a statement (exported or not).
function declarationsOf(statement) {
  const node = statement.type.startsWith('Export') ? (statement.declaration ?? null) : statement;
  if (!node) return [];
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id)
    return [[node.id.name, node]];
  if (node.type === 'VariableDeclaration')
    return node.declarations.filter(d => d.id.type === 'Identifier').map(d => [d.id.name, d]);
  return [];
}

function exportedFrom(statement, local) {
  if (statement.type === 'ExportDefaultDeclaration') {
    const d = statement.declaration;
    return [['default', d.type === 'Identifier' ? local.get(d.name) : d]];
  }
  if (statement.type !== 'ExportNamedDeclaration') return [];
  if (statement.declaration) return declarationsOf(statement);
  if (statement.source) return [];
  return statement.specifiers.map(s => [
    s.exported.name ?? s.exported.value,
    local.get(s.local.name),
  ]);
}

// export name -> the top-level declaration of this file that it exports.
function exportsOf(program) {
  const local = new Map(program.body.flatMap(declarationsOf));
  const out = new Map();
  for (const statement of program.body)
    for (const [name, node] of exportedFrom(statement, local)) if (node) out.set(name, node);
  return out;
}

// Each boundary's name in item keys: its component, with `#n` for the n-th one (n > 1) in source
// order, so two boundaries rendering one entry in a file have distinct keys (code-r1 H2).
function boundaryLabels(nodes) {
  const labels = new Map();
  const seen = new Map();
  for (const node of [...nodes].sort((a, b) => a.range[0] - b.range[0])) {
    const component = componentOf(node);
    const n = (seen.get(component) ?? 0) + 1;
    seen.set(component, n);
    labels.set(node, n === 1 ? component : `${component}#${n}`);
  }
  return labels;
}

export { boundaryLabels, exportsOf };
