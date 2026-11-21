const literalOf = node => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0].value.cooked;
  return null;
};

const isTypeOnlyImport = node =>
  node.importKind === 'type' ||
  (node.specifiers.length > 0 &&
    node.specifiers.every(s => s.type === 'ImportSpecifier' && s.importKind === 'type'));

// `export { type A, type B } from 'p'` is type-only like `export type { A, B } from 'p'` (H1).
const isTypeOnlyExport = node =>
  node.exportKind === 'type' ||
  (node.specifiers?.length > 0 && node.specifiers.every(s => s.exportKind === 'type'));

const exportEdge = node =>
  node.source
    ? { specifier: node.source.value, kind: isTypeOnlyExport(node) ? 'type' : 'import', node }
    : null;

// `import('p').T` in a type position (TSImportType): `source` in typescript-eslint 8, `argument`
// (a TSLiteralType) before it.
function importTypeEdge(node) {
  const value = literalOf(node.source ?? node.argument?.literal);
  return value === null ? null : { specifier: value, kind: 'type', node };
}

function requireEdge(node) {
  const value = node.arguments.length === 1 ? literalOf(node.arguments[0]) : null;
  if (node.callee.type === 'Identifier' && node.callee.name === 'require' && value !== null)
    return { specifier: value, kind: 'require', node };
  return null;
}

function importEqualsEdge(node) {
  if (node.moduleReference?.type !== 'TSExternalModuleReference') return null;
  const value = literalOf(node.moduleReference.expression);
  if (value === null) return null;
  return { specifier: value, kind: node.importKind === 'type' ? 'type' : 'require', node };
}

// node type -> the edge a node of that type makes, or null.
const EDGE_OF = {
  ImportDeclaration: node => ({
    specifier: node.source.value,
    kind: isTypeOnlyImport(node) ? 'type' : 'import',
    node,
  }),
  ExportNamedDeclaration: exportEdge,
  ExportAllDeclaration: exportEdge,
  ImportExpression: node => {
    const value = literalOf(node.source);
    return value === null ? null : { specifier: value, kind: 'dynamic', node };
  },
  CallExpression: requireEdge,
  TSImportEqualsDeclaration: importEqualsEdge,
  TSImportType: importTypeEdge,
};

// Every module edge of an ESTree program: static import, `export … from`, literal `import()`,
// literal `require()`, `import x = require()` and `import('p')` types. Kind: import | type |
// dynamic | require.
export function edgesOfProgram(program, visitorKeys) {
  const out = [];
  const visit = node => {
    if (!node || typeof node.type !== 'string') return;
    const edge = Object.hasOwn(EDGE_OF, node.type) ? EDGE_OF[node.type](node) : null;
    if (edge) out.push(edge);
    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(program);
  return out;
}

export function kindOfSpecifier(specifier) {
  if (specifier.startsWith('.')) return 'relative';
  if (specifier.startsWith('@/')) return 'alias';
  if (/^@interdomestik\/[^/]+/u.test(specifier)) return 'workspace';
  return 'external';
}
