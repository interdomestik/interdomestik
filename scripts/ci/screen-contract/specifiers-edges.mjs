import ts from 'typescript';

import { ScanError } from '../server-mutation/ast.mjs';
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

// A member of `module`: `'require'` for `module.require` or `module['require']` (r6, r7), which
// webpack also records as a CommonJS dependency when called with a literal; `'unknown'` for a
// computed member whose name is not a literal (`module[k]`); else null.
function moduleMember(node) {
  if (node?.type !== 'MemberExpression' || node.object?.type !== 'Identifier') return null;
  if (node.object.name !== 'module') return null;
  const name = node.computed
    ? literalOf(node.property)
    : node.property.type === 'Identifier'
      ? node.property.name
      : null;
  if (name === null) return node.computed ? 'unknown' : null;
  return name === 'require' ? 'require' : null;
}
const isModuleRequire = callee => moduleMember(callee) === 'require';

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
    case 'ArrowFunctionExpression':
      return parent.id === node || parent.params.includes(node);
    case 'TSTypeQuery':
    case 'TSQualifiedName':
      return true;
    default:
      return false;
  }
};

// A declaration the compiled code keeps: not ambient (`declare …`, inside a `declare module`,
// `declare namespace` or `declare global` block, an overload signature) and not a type-only
// import, which the emit erases (Sol r2). A plain `namespace` counts as kept (Sol r3); one that holds
// only types is erased by the emit, which this check does not tell apart: a named limit (MODULE.md,
// "Also named limits").
function isAmbient(node) {
  for (let at = node; at; at = at.parent)
    if (at.declare === true || at.type === 'TSDeclareFunction') return true;
  return false;
}
const isRuntimeDef = def =>
  def.type !== 'Type' &&
  !(
    def.type === 'ImportBinding' &&
    (def.parent?.importKind === 'type' || def.node?.importKind === 'type')
  ) &&
  !isAmbient(def.node);

// The identifiers that name the free CommonJS `module`: no runtime declaration in scope (a
// configured global has none either). A local binding named `module` (`import * as module`, a
// parameter) is not it (Sol r1); an ambient or type-only one is (Sol r2). Without a scope manager
// every `module` counts as free (fail closed).
function freeModuleIdentifiers(origin) {
  const manager = origin?.sourceCode?.scopeManager;
  if (!manager) return null;
  const out = new Set();
  for (const scope of manager.scopes)
    for (const ref of scope.references)
      if (ref.identifier.name === 'module' && !(ref.resolved?.defs ?? []).some(isRuntimeDef))
        out.add(ref.identifier);
  return out;
}

// A module request that is not a literal specifier (resolution.mjs, `REVIEWED_DYNAMIC_REQUESTS`):
// the node whose source text names it, or null. `parent` is the node's parent; `isFreeModule`
// tells whether a `module` identifier is the CommonJS one.
function dynamicRequest(node, parent, isFreeModule) {
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
    // `module[k]` with a computed name, and `module.require` other than called with one literal
    // (`const r = module.require`, r7: also `module['require']`).
    const freeModule = isFreeModule(node.object);
    if (freeModule && moduleMember(node) === 'unknown') return node;
    if (freeModule && isModuleRequire(node)) {
      const called = parent?.type === 'CallExpression' && parent.callee === node;
      return called && parent.arguments.length === 1 && literalOf(parent.arguments[0]) !== null
        ? null
        : node;
    }
    if (isImportMeta(node.object) && !isImportMetaUrl(node)) return node;
    return null;
  }
  if (node.type === 'NewExpression') return node.arguments.some(isImportMetaUrl) ? node : null;
  // A bare `require` that is neither called, nor a member's object or name, nor a declared name or
  // type query (`const r = require` is refused; `declare function require` is not a request).
  if (isIdentifier(node, 'require')) return BARE_REQUIRE_OK(node, parent) ? null : node;
  // r7: a bare `module` read as a value can carry its `require` elsewhere (`const m = module`,
  // `const { require: r } = module`); a member's object, a declared name or a type query is not.
  if (isIdentifier(node, 'module') && isFreeModule(node)) {
    const typeofRead = parent?.type === 'UnaryExpression' && parent.operator === 'typeof';
    return typeofRead || BARE_REQUIRE_OK(node, parent) ? null : node;
  }
  return null;
}

// Every module edge of an ESTree program: static import, `export … from`, literal `import()`,
// literal `require()`, `import x = require()` and `import('p').T`. Kind: import | type |
// dynamic | require. A module request that is not a literal specifier is refused unless it is a
// reviewed occurrence in `origin.rel` (its exact text from `origin.sourceCode`), and yields no edge.
export function edgesOfProgram(program, visitorKeys, origin = null) {
  const out = jsdocEdges(origin);
  const free = freeModuleIdentifiers(origin);
  const isFreeModule = node => isIdentifier(node, 'module') && (free === null || free.has(node));
  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    let edge = null;
    if (node.type === 'CallExpression') edge = requireEdge(node, isFreeModule);
    else if (Object.hasOwn(EDGE_OF, node.type)) edge = EDGE_OF[node.type](node);
    if (edge) out.push(edge);
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
