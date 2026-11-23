import { assertModelledRequest, assertReviewedDynamicRequest } from './resolution.mjs';

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

const isIdentifier = (node, name) => node?.type === 'Identifier' && node.name === name;
const isImportMeta = node =>
  node?.type === 'MetaProperty' && node.meta.name === 'import' && node.property.name === 'meta';
const isImportMetaUrl = node =>
  node?.type === 'MemberExpression' &&
  isImportMeta(node.object) &&
  !node.computed &&
  isIdentifier(node.property, 'url');

const BARE_REQUIRE_OK = (node, parent) => {
  switch (parent?.type) {
    case 'CallExpression':
      return parent.callee === node;
    case 'MemberExpression':
      return parent.object === node || (parent.property === node && !parent.computed);
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
    case 'TSPropertySignature':
      return parent.key === node && !parent.computed;
    case 'VariableDeclarator':
      return parent.id === node;
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'FunctionExpression':
      return parent.id === node || parent.params.includes(node);
    case 'TSTypeQuery':
    case 'TSQualifiedName':
      return true;
    default:
      return false;
  }
};

// A module request that is not a literal specifier (resolution.mjs, `REVIEWED_DYNAMIC_REQUESTS`):
// the node whose source text names it, or null. `parent` is the node's parent.
function dynamicRequest(node, parent) {
  if (node.type === 'ImportExpression') return literalOf(node.source) === null ? node : null;
  if (node.type === 'CallExpression') {
    const { callee } = node;
    if (isIdentifier(callee, 'require'))
      return node.arguments.length === 1 && literalOf(node.arguments[0]) !== null ? null : node;
    if (isIdentifier(callee, 'define') || isIdentifier(callee, 'createRequire')) return node;
    if (callee.type === 'MemberExpression' && isIdentifier(callee.property, 'createRequire'))
      return node;
    return null;
  }
  if (node.type === 'MemberExpression') {
    if (isIdentifier(node.object, 'require')) return node;
    if (isImportMeta(node.object) && !isImportMetaUrl(node)) return node;
    return null;
  }
  if (node.type === 'NewExpression') return node.arguments.some(isImportMetaUrl) ? node : null;
  // A bare `require` that is neither called, nor a member's object or name, nor a declared name or
  // type query (`const r = require` is refused; `declare function require` is not a request).
  if (isIdentifier(node, 'require')) return BARE_REQUIRE_OK(node, parent) ? null : node;
  return null;
}

// Every module edge of an ESTree program: static import, `export … from`, literal `import()`,
// literal `require()`, `import x = require()` and `import('p').T`. Kind: import | type |
// dynamic | require. A module request that is not a literal specifier is refused unless it is a
// reviewed occurrence in `origin.rel` (its exact text from `origin.sourceCode`), and yields no edge.
export function edgesOfProgram(program, visitorKeys, origin = null) {
  const out = [];
  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    const edge = Object.hasOwn(EDGE_OF, node.type) ? EDGE_OF[node.type](node) : null;
    if (edge) out.push(edge);
    const dynamic = dynamicRequest(node, parent);
    if (dynamic)
      assertReviewedDynamicRequest(
        origin?.rel ?? null,
        origin?.sourceCode?.getText(dynamic) ?? null
      );
    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(item => visit(item, node));
      else visit(child, node);
    }
  };
  visit(program, null);
  return out;
}

// The kind of a request; a form D-1 does not model is refused here (resolution.mjs), so no rule can
// classify it as external and skip it.
export function kindOfSpecifier(specifier) {
  assertModelledRequest(specifier);
  if (specifier.startsWith('.')) return 'relative';
  if (specifier.startsWith('@/')) return 'alias';
  if (/^@interdomestik\/[^/]+/u.test(specifier)) return 'workspace';
  return 'external';
}
