import ts from 'typescript';

import { ScanError } from '../server-mutation/ast.mjs';
import {
  dynamicRequest,
  freeModuleIdentifiers,
  isIdentifier,
  isModuleRequire,
  literalOf,
} from './dynamic-requests.mjs';
import { assertModelledRequest, assertReviewedDynamicRequest } from './requests.mjs';

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

// `isFreeModule` tells whether a `module` identifier is the CommonJS one (Sol r2: a local binding's
// `module.require('…')` is an ordinary method call, no request).
function requireEdge(node, isFreeModule = () => true) {
  const value = node.arguments.length === 1 ? literalOf(node.arguments[0]) : null;
  const { callee } = node;
  const isRequire =
    (callee.type === 'Identifier' && callee.name === 'require') ||
    (isModuleRequire(callee) && isFreeModule(callee.object));
  if (isRequire && value !== null) return { specifier: value, kind: 'require', node };
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

// In a JavaScript file TypeScript also resolves JSDoc imports: `@import … from '…'` and
// `import('…')` types (r6). They are read from TypeScript's own parse of the file (r7), so every
// spelling TypeScript accepts is an edge: each a type edge, reported at its comment.
const JS_FILE_RE = /\.(?:js|jsx|mjs|cjs)$/u;
function jsdocEdges(origin) {
  if (!origin?.sourceCode || !JS_FILE_RE.test(origin.rel ?? '')) return [];
  const { text } = origin.sourceCode;
  const kind = origin.rel.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  const file = ts.createSourceFile(origin.rel, text, ts.ScriptTarget.Latest, true, kind);
  const comments = origin.sourceCode.getAllComments();
  const out = [];
  const add = literal => {
    const at = literal.getStart(file);
    const comment = comments.find(c => c.range[0] <= at && at < c.range[1]);
    if (!comment) throw new ScanError(`${origin.rel}: a JSDoc import outside a comment`);
    out.push({ specifier: literal.text, kind: 'type', node: comment });
  };
  const visit = node => {
    for (const doc of node.jsDoc ?? []) visit(doc);
    if (node.kind === ts.SyntaxKind.JSDocImportTag && ts.isStringLiteral(node.moduleSpecifier))
      add(node.moduleSpecifier);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      add(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

// Every module edge of an ESTree program: static import, `export … from`, literal `import()`,
// literal `require()`, `import x = require()` and `import('p').T`. Kind: import | type |
// dynamic | require. A value edge to Node's `module` builtin and any unmodelled request form
// must be reviewed by file (`origin.rel`) and exact source text (`origin.sourceCode`).
export function edgesOfProgram(program, visitorKeys, origin = null) {
  const out = jsdocEdges(origin);
  const free = freeModuleIdentifiers(origin);
  const isFreeModule = node => isIdentifier(node, 'module') && (free === null || free.has(node));
  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    let edge = null;
    if (node.type === 'CallExpression') edge = requireEdge(node, isFreeModule);
    else if (Object.hasOwn(EDGE_OF, node.type)) edge = EDGE_OF[node.type](node);
    if (edge) {
      if (edge.kind !== 'type' && (edge.specifier === 'module' || edge.specifier === 'node:module'))
        assertReviewedDynamicRequest(
          origin?.rel ?? null,
          origin?.sourceCode?.getText(edge.node) ?? null
        );
      out.push(edge);
    }
    const dynamic = dynamicRequest(node, parent, isFreeModule);
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
